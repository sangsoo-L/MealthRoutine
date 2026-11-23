package com.healthlab.mealthroutine.backend.user.dto;

/** PIN format (PIN7-9): exactly 6 ASCII digits, sent as a JSON string so leading zeros are kept. */
final class PinRules {

    static final String PIN_RULE = "[0-9]{6}";

    private PinRules() {
    }
}
