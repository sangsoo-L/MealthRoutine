package com.healthlab.mealthroutine.backend.exercise.domain;

import com.healthlab.mealthroutine.backend.exercise.dto.SetTarget;
import java.util.List;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Converts per-set targets to and from the text stored in a JSON column (set_targets). The column is mapped as a
 * String with @JdbcTypeCode(SqlTypes.JSON), the same way as QuizQuestion.options, so Hibernate never needs its own
 * JSON library. Values are already validated by SetTargetValidator before they are written.
 */
public final class SetTargetsJson {

    private static final JsonMapper MAPPER = JsonMapper.builder().build();
    private static final TypeReference<List<SetTarget>> TYPE = new TypeReference<>() {
    };

    private SetTargetsJson() {
    }

    public static String write(List<SetTarget> sets) {
        return sets == null ? null : MAPPER.writeValueAsString(sets);
    }

    public static List<SetTarget> read(String json) {
        return json == null ? null : List.copyOf(MAPPER.readValue(json, TYPE));
    }
}
