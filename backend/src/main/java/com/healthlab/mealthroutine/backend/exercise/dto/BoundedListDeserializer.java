package com.healthlab.mealthroutine.backend.exercise.dto;

import java.util.ArrayList;
import java.util.List;
import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.deser.std.StdDeserializer;
import tools.jackson.databind.exc.MismatchedInputException;

/**
 * Reads a JSON array but stops with a 400 as soon as it holds more than {@code maxSize} elements. A @Size check runs
 * only after Jackson has built the whole list, so a body with millions of tiny elements ({@code [{},{},...]}) would
 * first fill the heap. Counting while reading caps the memory one request can take. Null elements are kept so the
 * usual @NotNull checks still report them.
 */
public abstract class BoundedListDeserializer<T> extends StdDeserializer<List<T>> {

    private final Class<T> elementType;
    private final int maxSize;

    protected BoundedListDeserializer(Class<T> elementType, int maxSize) {
        super(List.class);
        this.elementType = elementType;
        this.maxSize = maxSize;
    }

    @Override
    public List<T> deserialize(JsonParser parser, DeserializationContext context) {
        if (parser.currentToken() != JsonToken.START_ARRAY) {
            throw MismatchedInputException.from(parser, List.class, "expected a JSON array");
        }
        List<T> result = new ArrayList<>();
        JsonToken token;
        while ((token = parser.nextToken()) != JsonToken.END_ARRAY) {
            if (result.size() == maxSize) {
                throw MismatchedInputException.from(parser, List.class, "more than " + maxSize + " elements");
            }
            result.add(token == JsonToken.VALUE_NULL ? null : context.readValue(parser, elementType));
        }
        return result;
    }

    /** Per-set targets of one item: at most 200, the same limit as the frontend (MAX_SETS_PER_ITEM). */
    public static class SetTargets extends BoundedListDeserializer<SetTargetRequest> {
        public SetTargets() {
            super(SetTargetRequest.class, 200);
        }
    }

    /** Items of one routine: at most 100, the existing routine limit. */
    public static class RoutineItems extends BoundedListDeserializer<RoutineItemRequest> {
        public RoutineItems() {
            super(RoutineItemRequest.class, 100);
        }
    }
}
