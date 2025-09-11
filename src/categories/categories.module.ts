import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CanonicalCategoryController } from './canonical-category.controller';
import { CanonicalCategoryService } from './canonical-category.service';

@Module({
  controllers: [CategoriesController, CanonicalCategoryController],
  providers: [CategoriesService, CanonicalCategoryService],
  exports: [CategoriesService, CanonicalCategoryService],
})
export class CategoriesModule {}
