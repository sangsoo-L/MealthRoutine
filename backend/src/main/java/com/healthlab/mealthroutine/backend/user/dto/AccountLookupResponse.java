package com.healthlab.mealthroutine.backend.user.dto;

/** Only whether an account matches both values (ACCT6-3). Every non-match looks the same. */
public record AccountLookupResponse(boolean matched) {
}
