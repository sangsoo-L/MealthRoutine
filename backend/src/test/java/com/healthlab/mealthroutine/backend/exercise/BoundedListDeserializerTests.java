package com.healthlab.mealthroutine.backend.exercise;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.healthlab.mealthroutine.backend.exercise.dto.RoutineCreateRequest;
import com.healthlab.mealthroutine.backend.exercise.dto.RoutineItemRequest;
import java.util.Collections;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.exc.MismatchedInputException;
import tools.jackson.databind.json.JsonMapper;

/**
 * The list readers stop as soon as a list passes its limit (security review: a @Size check alone runs only after the
 * whole list is in memory). Each oversized input below ends in broken JSON: if the reader kept going it would fail on
 * that instead, so the "more than N elements" message proves it stopped early.
 */
class BoundedListDeserializerTests {

    private final JsonMapper mapper = JsonMapper.builder().build();

    @Test
    void setsStopAfter200() {
        String json = "{\"exerciseId\":1,\"recordType\":\"reps\",\"sets\":["
                + String.join(",", Collections.nCopies(201, "{}")) + ", !!! not json";
        assertThatThrownBy(() -> mapper.readValue(json, RoutineItemRequest.class))
                .isInstanceOf(MismatchedInputException.class)
                .hasMessageContaining("more than 200 elements");
    }

    @Test
    void itemsStopAfter100() {
        String json = "{\"routineName\":\"x\",\"items\":["
                + String.join(",", Collections.nCopies(101, "{\"exerciseId\":1,\"targetSets\":1}")) + ", !!! not json";
        assertThatThrownBy(() -> mapper.readValue(json, RoutineCreateRequest.class))
                .isInstanceOf(MismatchedInputException.class)
                .hasMessageContaining("more than 100 elements");
    }

    @Test
    void listsAtTheLimitAndNullElementsAreRead() throws Exception {
        String json = "{\"exerciseId\":1,\"recordType\":\"reps\",\"sets\":["
                + String.join(",", Collections.nCopies(199, "{\"reps\":1}")) + ",null]}";
        RoutineItemRequest item = mapper.readValue(json, RoutineItemRequest.class);
        assertThat(item.sets()).hasSize(200);
        assertThat(item.sets().get(199)).isNull();
        assertThat(item.sets().get(0).reps()).isEqualByComparingTo("1");
    }
}
