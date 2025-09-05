import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  Min,
  Max,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CategoryBudgetDto {
  @ApiProperty({
    description: 'Category name',
    example: 'Food & Dining',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Category color (hex)',
    example: '#10B981',
  })
  @IsString()
  @IsNotEmpty()
  color: string;

  @ApiProperty({
    description: 'Monthly budget amount in INR',
    example: 5000,
  })
  @IsNumber()
  @Min(100)
  @Max(500000) // Increased to accommodate larger budgets
  amount: number;

  @ApiProperty({
    description: 'Category percentage of total budget',
    example: 30,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(100)
  percentage?: number;

  @ApiProperty({
    description: 'Category description',
    example: 'Meals, groceries, restaurants',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;
}

export class CategoryCapDto {
  @ApiProperty({
    description: 'Unique cap identifier',
    example: 'cap_0',
  })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({
    description: 'Category name',
    example: 'Food & Dining',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Category color (hex)',
    example: '#10B981',
  })
  @IsString()
  @IsNotEmpty()
  color: string;

  @ApiProperty({
    description: 'Category description',
    example: 'Meals, groceries, restaurants',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Daily spending limit in INR',
    example: 500,
  })
  @IsNumber()
  @Min(10)
  @Max(50000)
  dailyLimit: number;

  @ApiProperty({
    description: 'Weekly spending limit in INR',
    example: 3000,
  })
  @IsNumber()
  @Min(50)
  @Max(200000)
  weeklyLimit: number;

  @ApiProperty({
    description: 'Monthly spending limit in INR',
    example: 12000,
  })
  @IsNumber()
  @Min(100)
  @Max(500000)
  monthlyLimit: number;

  @ApiProperty({
    description: 'Whether the spending cap is enabled',
    example: true,
  })
  @IsBoolean()
  isEnabled: boolean;
}

export class CompleteOnboardingDto {
  @ApiProperty({
    description: 'User full name',
    example: 'Boopathy NR',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Monthly salary in INR',
    example: 50000,
  })
  @IsNumber()
  @Min(10000)
  @Max(1000000)
  salary: number;

  @ApiProperty({
    description: 'Total monthly expense budget in INR',
    example: 25000,
  })
  @IsNumber()
  @Min(5000)
  @Max(500000)
  totalBudget: number;

  @ApiProperty({
    description: 'Category-wise budget allocation',
    type: [CategoryBudgetDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryBudgetDto)
  categories: CategoryBudgetDto[];

  @ApiProperty({
    description: 'Category spending caps configuration',
    type: [CategoryCapDto],
    required: false,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryCapDto)
  @IsOptional()
  caps?: CategoryCapDto[];
}

export class OnboardingResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true,
  })
  ok: boolean;

  @ApiProperty({
    description: 'User information after onboarding',
  })
  user: {
    id: string;
    name: string;
    phone: string;
    isOnboarded: boolean;
  };
}

export class BudgetRecommendationDto {
  @ApiProperty({
    description: 'Recommended budget based on salary',
  })
  recommendation: {
    totalBudget: number;
    salaryPercentage: number;
    categories: Array<{
      name: string;
      color: string;
      amount: number;
      percentage: number;
      description: string;
    }>;
  };
}
