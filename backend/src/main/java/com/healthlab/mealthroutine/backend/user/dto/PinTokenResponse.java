package com.healthlab.mealthroutine.backend.user.dto;

/** PIN token for the X-Pin-Token header (P-02). expiresIn is in seconds (600). */
public record PinTokenResponse(String pinToken, long expiresIn) {

    /** Hides the token if this object is ever logged. */
    @Override
    public String toString() {
        return "PinTokenResponse[pinToken=(hidden), expiresIn=" + expiresIn + "]";
    }
}
