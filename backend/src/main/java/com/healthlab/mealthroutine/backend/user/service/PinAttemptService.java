package com.healthlab.mealthroutine.backend.user.service;

import com.healthlab.mealthroutine.backend.user.domain.User;
import com.healthlab.mealthroutine.backend.user.jwt.JwtTokenProvider;
import com.healthlab.mealthroutine.backend.user.repository.UserRepository;
import com.healthlab.mealthroutine.backend.user.service.PinCheckResult.Outcome;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The PIN transactions (PIN7-4, PIN7-10, PIN7-11). Each one starts by locking the user's row, so PIN checks and
 * changes for one user run one at a time, and every decision uses the latest committed values.
 * <ul>
 *   <li>The time is read from the clock after the lock is held: a request that waited past the end of a lock must
 *   see the lock as over.</li>
 *   <li>Business outcomes are returned, not thrown, so a saved failure count commits. Anything unexpected is
 *   thrown and rolls back.</li>
 *   <li>Only called by PinService (no transaction of its own), so each method here is a whole transaction.</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
class PinAttemptService {

    static final int MAX_FAILURES = 5;
    static final Duration LOCK_DURATION = Duration.ofMinutes(10);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final Clock clock;

    /**
     * First PIN (PIN7-6, PIN7-11): the PIN is saved and the PIN token is made in one transaction, so a token
     * failure also undoes the PIN. newPinHash is computed by the caller before the lock (BCrypt is slow).
     */
    @Transactional
    public PinCheckResult setPin(Long userId, String newPinHash) {
        Optional<User> found = userRepository.findByIdForUpdate(userId);
        if (found.isEmpty()) {
            return PinCheckResult.of(Outcome.USER_NOT_FOUND);
        }
        if (found.get().hasPin()) {
            return PinCheckResult.of(Outcome.ALREADY_SET);
        }
        expectOneRow(userRepository.savePin(userId, newPinHash), userId, "savePin");
        return PinCheckResult.successWithToken(jwtTokenProvider.createPinToken(userId, clock.instant()));
    }

    /** POST /pin/verify. On success the caller makes the PIN token after this transaction committed. */
    @Transactional
    public PinCheckResult verify(Long userId, String pin) {
        Optional<User> found = userRepository.findByIdForUpdate(userId);
        if (found.isEmpty()) {
            return PinCheckResult.of(Outcome.USER_NOT_FOUND);
        }
        return checkPin(found.get(), pin, LocalDateTime.now(clock));
    }

    /**
     * PATCH /pin (PIN7-7). The proof is checked and the new PIN saved under the same row lock, so a password change
     * that commits first makes an old currentPassword fail, and one that starts later waits for this to finish.
     */
    @Transactional
    public PinCheckResult change(Long userId, String newPinHash, String currentPin, String currentPassword) {
        Optional<User> found = userRepository.findByIdForUpdate(userId);
        if (found.isEmpty()) {
            return PinCheckResult.of(Outcome.USER_NOT_FOUND);
        }
        User user = found.get();
        if (!user.hasPin()) {
            return PinCheckResult.of(Outcome.NOT_REGISTERED);
        }
        LocalDateTime now = LocalDateTime.now(clock);
        if (currentPin != null) {
            PinCheckResult checked = checkPin(user, currentPin, now); // same failure count and lock as verify
            if (!checked.succeeded()) {
                return checked;
            }
        } else if (currentPassword != null) {
            if (user.getPasswordHash() == null) {
                return PinCheckResult.of(Outcome.PASSWORD_NOT_SET);
            }
            // A wrong password does not count as a PIN failure; PATCH /pin has its own attempt limit (PIN7-8).
            if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
                return PinCheckResult.of(Outcome.PASSWORD_MISMATCH);
            }
        } else if (user.getPasswordHash() != null) {
            return PinCheckResult.of(Outcome.PROOF_REQUIRED); // only a social-only account may skip the proof (Q-24)
        }
        // Saving the new PIN also clears failures and any lock, which is how currentPassword recovers a locked PIN.
        expectOneRow(userRepository.savePin(user.getUserId(), newPinHash), user.getUserId(), "savePin");
        return PinCheckResult.success();
    }

    /**
     * Checks a PIN against the locked row and saves the new failure count. A lock that has ended counts as no lock
     * and no failures, so the user has 5 tries again. While locked, BCrypt is not even run.
     */
    private PinCheckResult checkPin(User user, String pin, LocalDateTime now) {
        if (!user.hasPin()) {
            return PinCheckResult.of(Outcome.NOT_REGISTERED);
        }
        Long userId = user.getUserId();
        int failures = user.getPinFailedCount();
        LocalDateTime lockedUntil = user.getPinLockedUntil();
        if (lockedUntil != null) {
            if (now.isBefore(lockedUntil)) {
                return PinCheckResult.locked(lockedUntil);
            }
            failures = 0; // the lock is over
        }
        if (passwordEncoder.matches(pin, user.getPinHash())) {
            if (user.getPinFailedCount() != 0 || lockedUntil != null) {
                expectOneRow(userRepository.savePinAttempts(userId, (byte) 0, null), userId, "savePinAttempts");
            }
            return PinCheckResult.success();
        }
        failures++;
        if (failures >= MAX_FAILURES) {
            LocalDateTime until = lockEnd(now);
            expectOneRow(userRepository.savePinAttempts(userId, (byte) failures, until), userId, "savePinAttempts");
            return PinCheckResult.locked(until);
        }
        expectOneRow(userRepository.savePinAttempts(userId, (byte) failures, null), userId, "savePinAttempts");
        return PinCheckResult.invalid(MAX_FAILURES - failures);
    }

    /**
     * now + 10 minutes, rounded up to a whole second. pin_locked_until is DATETIME (no fractions) and MySQL rounds
     * a fraction it stores, so without this the 5th failure's response could show 12:02:28.0835 while the DB and
     * every later response say 12:02:28 (found in the manual server check). Rounding up keeps the lock at least
     * 10 minutes and makes the response equal the stored value.
     */
    static LocalDateTime lockEnd(LocalDateTime now) {
        LocalDateTime end = now.plus(LOCK_DURATION);
        LocalDateTime whole = end.truncatedTo(ChronoUnit.SECONDS);
        return whole.equals(end) ? end : whole.plusSeconds(1);
    }

    /**
     * The row is locked by this transaction, so another one cannot change or delete it meanwhile: 0 rows here is a
     * bug or a broken DB, not a business case. Throwing rolls everything back and answers 500.
     */
    private static void expectOneRow(int updated, Long userId, String query) {
        if (updated != 1) {
            throw new IllegalStateException("Unexpected row count " + updated + " from " + query + ", userId=" + userId);
        }
    }
}
