package com.healthlab.mealthroutine.backend.community.service;

import com.healthlab.mealthroutine.backend.common.BusinessException;
import com.healthlab.mealthroutine.backend.common.ErrorCode;
import com.healthlab.mealthroutine.backend.community.domain.PostType;
import java.util.List;

/**
 * Input rules for posts (C1, plan 4.4). The frontend checks the same rules first (ERR-2), so every failure here is a
 * plain 400 INVALID_REQUEST.
 * <ul>
 *   <li>Lengths count code points, the way MySQL counts VARCHAR characters: one emoji is one character.</li>
 *   <li>Leading and trailing blanks are exactly the characters JavaScript's trim() removes (the screen uses trim()):
 *       tab, line feed, vertical tab, form feed, carriage return, U+FEFF, U+2028, U+2029 and every Unicode space
 *       separator (space, no-break space U+00A0, ideographic space U+3000, ...). Java's strip() differs both ways:
 *       it keeps U+00A0 and removes U+001C~U+001F, which trim() keeps.</li>
 * </ul>
 */
final class PostRules {

    static final int TITLE_MAX = 250;          // community_posts.title VARCHAR(250)
    static final int CONTENT_MAX = 5_000;      // decision C1-D4
    static final int PAGE_SIZE_DEFAULT = 20;
    static final int PAGE_SIZE_MAX = 100;

    /** Types a list may ask for. NOTICE is never shown (Q-11). */
    static final List<PostType> LISTABLE = List.of(PostType.GENERAL, PostType.ROUTINE, PostType.QUESTION);

    private PostRules() {
    }

    /** Only the free board can be written in this unit (decision C1-D8). */
    static PostType creatableType(String value) {
        if (!PostType.GENERAL.apiValue().equals(value)) {
            throw invalid();
        }
        return PostType.GENERAL;
    }

    /** Null (no filter) means every listable type. */
    static List<PostType> listTypes(String value) {
        if (value == null) {
            return LISTABLE;
        }
        return List.of(PostType.fromApiValue(value).orElseThrow(PostRules::invalid));
    }

    static String text(String value, int max) {
        if (value == null) {
            throw invalid();
        }
        String trimmed = trimBlank(value);
        int length = trimmed.codePointCount(0, trimmed.length());
        if (length == 0 || length > max) {
            throw invalid();
        }
        return trimmed;
    }

    static int page(Integer page) {
        if (page == null) {
            return 0;
        }
        if (page < 0) {
            throw invalid();
        }
        return page;
    }

    static int size(Integer size) {
        if (size == null) {
            return PAGE_SIZE_DEFAULT;
        }
        if (size < 1 || size > PAGE_SIZE_MAX) {
            throw invalid();
        }
        return size;
    }

    static String trimBlank(String value) {
        int start = 0;
        int end = value.length();
        while (start < end) {
            int cp = value.codePointAt(start);
            if (!isBlank(cp)) {
                break;
            }
            start += Character.charCount(cp);
        }
        while (end > start) {
            int cp = value.codePointBefore(end);
            if (!isBlank(cp)) {
                break;
            }
            end -= Character.charCount(cp);
        }
        return value.substring(start, end);
    }

    /** The JavaScript trim() set: WhiteSpace and LineTerminator of the ECMAScript spec. */
    private static boolean isBlank(int cp) {
        return switch (cp) {
            case 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0xFEFF, 0x2028, 0x2029 -> true;
            default -> Character.getType(cp) == Character.SPACE_SEPARATOR;
        };
    }

    private static BusinessException invalid() {
        return new BusinessException(ErrorCode.INVALID_REQUEST);
    }
}
