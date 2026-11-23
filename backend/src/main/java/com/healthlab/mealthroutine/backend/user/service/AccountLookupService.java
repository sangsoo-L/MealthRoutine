package com.healthlab.mealthroutine.backend.user.service;

import com.healthlab.mealthroutine.backend.user.domain.AccountStatus;
import com.healthlab.mealthroutine.backend.user.dto.AccountLookupRequest;
import com.healthlab.mealthroutine.backend.user.repository.UserRepository;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Account lookup (FIND-1, ACCT6-1~3): true only when one account has both this email and exactly this real name.
 * No log line here: email, name and result are all personal.
 */
@Service
@RequiredArgsConstructor
public class AccountLookupService {

    /** Accounts that can still log in or be restored (ACCT6-2). Deleted accounts never match. */
    private static final Set<AccountStatus> LOOKUP_STATUSES =
            Set.of(AccountStatus.ACTIVE, AccountStatus.SUSPENDED, AccountStatus.PENDING_DELETION);

    private final UserRepository userRepository;

    /**
     * One query by email (unique), then the name is compared in Java. A SQL "where username = ?" would follow the
     * table's comparison rule (utf8mb4_0900_ai_ci), which treats "John" and "john", or "José" and "Jose", as equal.
     */
    @Transactional(readOnly = true)
    public boolean matches(AccountLookupRequest request) {
        return userRepository.findByEmail(request.email())
                .filter(user -> LOOKUP_STATUSES.contains(user.getAccountStatus()))
                .map(user -> user.getUsername().equals(request.username()))
                .orElse(false);
    }
}
