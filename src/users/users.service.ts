import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserProfileDto, UpdateUserSettingsDto } from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get user profile with settings
   */
  async getUserProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userSettings: true,
        categories: {
          select: {
            id: true,
            name: true,
            color: true,
            capAmount: true,
            softBlock: true,
            nearThresholdPct: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      phone: user.phoneE164,
      name: user.name,
      avatarUrl: user.avatarUrl,
      isOnboardingComplete: user.isOnboardingComplete,
      monthlySalary: user.monthlySalary,
      currency: user.currency,
      timeZone: user.timeZone,
      language: user.language,
      notificationsEnabled: user.notificationsEnabled,
      createdAt: user.createdAt,
      settings: user.userSettings,
      categories: user.categories,
    };
  }

  /**
   * Update user profile information
   */
  async updateUserProfile(userId: string, updateData: UpdateUserProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...updateData,
      },
      include: {
        userSettings: true,
      },
    });

    return {
      id: user.id,
      phone: user.phoneE164,
      name: user.name,
      avatarUrl: user.avatarUrl,
      isOnboardingComplete: user.isOnboardingComplete,
      monthlySalary: user.monthlySalary,
      currency: user.currency,
      timeZone: user.timeZone,
      language: user.language,
      notificationsEnabled: user.notificationsEnabled,
      settings: user.userSettings,
    };
  }

  /**
   * Update user settings
   */
  async updateUserSettings(
    userId: string,
    settingsData: UpdateUserSettingsDto,
  ) {
    // Check if settings exist, create if not
    const existingSettings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!existingSettings) {
      // Create new settings
      const newSettings = await this.prisma.userSettings.create({
        data: {
          userId,
          ...settingsData,
        },
      });
      return newSettings;
    }

    // Update existing settings
    const updatedSettings = await this.prisma.userSettings.update({
      where: { userId },
      data: settingsData,
    });

    return updatedSettings;
  }

  /**
   * Delete user account (GDPR compliance)
   */
  async deleteUserAccount(userId: string) {
    // This will cascade delete all related data due to foreign key constraints
    await this.prisma.user.delete({
      where: { id: userId },
    });

    return { success: true, message: 'Account deleted successfully' };
  }
}
