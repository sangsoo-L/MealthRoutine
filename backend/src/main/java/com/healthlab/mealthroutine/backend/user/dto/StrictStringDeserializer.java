package com.healthlab.mealthroutine.backend.user.dto;

import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.deser.std.StdDeserializer;

/**
 * Accepts only a JSON string. By default Jackson turns 12 or true into "12" or "true", which would then pass the
 * nickname rule (letters and digits) or be saved as a food to avoid. Used only on ProfileUpdateRequest, not globally,
 * so other teams' APIs keep the default behaviour. A JSON null never reaches here and stays null ("no change").
 * Anything else is a 400 INVALID_REQUEST (an unreadable request body).
 */
public class StrictStringDeserializer extends StdDeserializer<String> {

    public StrictStringDeserializer() {
        super(String.class);
    }

    @Override
    public String deserialize(JsonParser parser, DeserializationContext context) {
        if (parser.currentToken() == JsonToken.VALUE_STRING) {
            return parser.getString();
        }
        return (String) context.handleUnexpectedToken(String.class, parser);
    }
}
