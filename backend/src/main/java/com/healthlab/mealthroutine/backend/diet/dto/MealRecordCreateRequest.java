package com.healthlab.mealthroutine.backend.diet.dto;

import com.healthlab.mealthroutine.backend.diet.domain.MealType;
import com.healthlab.mealthroutine.backend.diet.domain.RecordType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.math.BigDecimal;
import java.time.LocalDateTime;

public record MealRecordCreateRequest(
        @NotNull LocalDateTime mealAt, //먹은시간  // null이면 400 에러 (시간 안 보내면 거절)
        @NotNull MealType mealType,// LUNCH 등 (필수)  // 없거나 "점심"처럼 enum에 없는 값이면 거절
        RecordType recordType, // 안 보내면 ACTUAL
        @Size(max=1000) String notes, // 메모 (선택)/ 1000자 넘으면 거절 (DB 컬럼 길이랑 맞춤)
        @NotEmpty List<@Valid Item> items // 음식 최소 1개 // 빈 배열 []이면 거절 + 안쪽 Item도 하나씩 검사
) {
    public record Item(
            @NotNull Long foodId,  // 어떤 음식인지 (필수)
            @NotNull @DecimalMin("0.1")BigDecimal quantity // 몇인분인지 , 0.1 미만이면 거절
            ){}


}
