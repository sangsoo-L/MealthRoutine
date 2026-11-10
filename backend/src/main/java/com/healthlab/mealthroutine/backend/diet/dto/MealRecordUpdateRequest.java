package com.healthlab.mealthroutine.backend.diet.dto;

import com.healthlab.mealthroutine.backend.diet.domain.MealType;
import com.healthlab.mealthroutine.backend.diet.domain.RecordType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;
import java.util.List;

public record MealRecordUpdateRequest(LocalDateTime mealAt,
                                     MealType mealType,
                                     RecordType recordType,
                                     @Size(max=1000) String notes,
                                     @Size(min = 1)List<MealRecordCreateRequest.@Valid Item> items)
{}
