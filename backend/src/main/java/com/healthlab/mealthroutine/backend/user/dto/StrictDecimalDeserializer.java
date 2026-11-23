package com.healthlab.mealthroutine.backend.user.dto;

import java.math.BigDecimal;
import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.deser.std.StdDeserializer;

/**
 * Accepts only a plain JSON number (HEALTH8-3): 170 or 170.5. A string ("170"), true, an array and exponent notation
 * (1.7e2) are a 400 INVALID_REQUEST (an unreadable request body). The value is read from the number's own text, so
 * 170.5 stays exactly 170.5. Used only on body measurement requests, not globally. A JSON null never reaches here.
 */
public class StrictDecimalDeserializer extends StdDeserializer<BigDecimal> {

    public StrictDecimalDeserializer() {
        super(BigDecimal.class);
    }

    @Override
    public BigDecimal deserialize(JsonParser parser, DeserializationContext context) {
        JsonToken token = parser.currentToken();
        if (token == JsonToken.VALUE_NUMBER_INT || token == JsonToken.VALUE_NUMBER_FLOAT) {
            String text = parser.getString();
            if (text.indexOf('e') < 0 && text.indexOf('E') < 0) {
                return new BigDecimal(text);
            }
        }
        return (BigDecimal) context.handleUnexpectedToken(BigDecimal.class, parser);
    }
}
