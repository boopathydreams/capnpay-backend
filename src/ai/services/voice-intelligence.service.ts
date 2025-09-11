import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface VoiceProcessingResult {
  transcript: string;
  confidence: number;
  language: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  intent: VoiceIntent;
  entities: VoiceEntity[];
  insights: VoiceInsight[];
  spendingEmotions: EmotionalSpendingInsight;
}

export interface VoiceIntent {
  type:
    | 'payment_note'
    | 'reminder'
    | 'budget_concern'
    | 'expense_regret'
    | 'future_planning';
  confidence: number;
  actionable: boolean;
}

export interface VoiceEntity {
  type: 'amount' | 'category' | 'merchant' | 'person' | 'date' | 'emotion';
  value: string;
  confidence: number;
  position: [number, number]; // start, end indices
}

export interface VoiceInsight {
  type:
    | 'spending_pattern'
    | 'emotional_trigger'
    | 'future_intent'
    | 'regret_indicator';
  message: string;
  confidence: number;
  actionable: boolean;
  suggestedAction?: string;
}

export interface EmotionalSpendingInsight {
  primaryEmotion:
    | 'happy'
    | 'stressed'
    | 'guilty'
    | 'excited'
    | 'worried'
    | 'neutral';
  impulsivity: number; // 0-1 scale
  regretLevel: number; // 0-1 scale
  planningIndicator: number; // 0-1 scale
  spendingTriggers: string[];
}

@Injectable()
export class VoiceIntelligenceService {
  private readonly logger = new Logger(VoiceIntelligenceService.name);
  private readonly SPEECH_API_URL: string;
  private readonly NLP_API_URL: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.SPEECH_API_URL =
      this.config.get('SPEECH_API_URL') || 'https://api.openai.com/v1';
    this.NLP_API_URL =
      this.config.get('NLP_API_URL') || 'https://api.openai.com/v1';
  }

  /**
   * Process uploaded voice memo with advanced NLP analysis
   */
  async processVoiceMemo(
    audioBuffer: Buffer,
    mimeType: string,
    userId: string,
    paymentContext?: any,
  ): Promise<VoiceProcessingResult> {
    try {
      // Step 1: Speech-to-Text with multiple providers for accuracy
      const transcript = await this.speechToText(audioBuffer, mimeType);

      // Step 2: Advanced NLP Analysis
      const nlpAnalysis = await this.analyzeTranscript(
        transcript.text,
        userId,
        paymentContext,
      );

      // Step 3: Emotional spending analysis
      const emotionalInsights = await this.analyzeEmotionalSpending(
        transcript.text,
        userId,
      );

      // Step 4: Generate actionable insights
      const insights = await this.generateActionableInsights(
        transcript.text,
        nlpAnalysis,
        emotionalInsights,
      );

      const result: VoiceProcessingResult = {
        transcript: transcript.text,
        confidence: transcript.confidence,
        language: transcript.language,
        sentiment: nlpAnalysis.sentiment,
        intent: nlpAnalysis.intent,
        entities: nlpAnalysis.entities,
        insights,
        spendingEmotions: emotionalInsights,
      };

      // Store insights for user behavior learning
      await this.storeVoiceInsights(userId, result);

      return result;
    } catch (error) {
      this.logger.error(`Voice processing failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Multi-provider speech-to-text with fallback
   */
  private async speechToText(audioBuffer: Buffer, mimeType: string) {
    try {
      // Primary: OpenAI Whisper (high accuracy)
      const whisperResult = await this.whisperTranscription(
        audioBuffer,
        mimeType,
      );
      if (whisperResult.confidence > 0.8) {
        return whisperResult;
      }

      // Fallback: Google Speech-to-Text
      this.logger.warn('Whisper confidence low, trying Google STT');
      return await this.googleSpeechToText(audioBuffer, mimeType);
    } catch (error) {
      this.logger.error(`Speech-to-text failed: ${error.message}`);
      return {
        text: '[Audio transcription failed]',
        confidence: 0,
        language: 'en',
      };
    }
  }

  /**
   * OpenAI Whisper transcription
   */
  private async whisperTranscription(audioBuffer: Buffer, mimeType: string) {
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([audioBuffer as any], { type: mimeType }),
      'audio.m4a',
    );
    formData.append('model', 'whisper-1');
    formData.append('language', 'en'); // Auto-detect in production
    formData.append('response_format', 'verbose_json');

    const response = await this.httpService
      .post(`${this.SPEECH_API_URL}/audio/transcriptions`, formData, {
        headers: {
          Authorization: `Bearer ${this.config.get('OPENAI_API_KEY')}`,
          'Content-Type': 'multipart/form-data',
        },
      })
      .toPromise();

    const result = response.data;
    return {
      text: result.text,
      confidence: this.calculateWhisperConfidence(result),
      language: result.language || 'en',
    };
  }

  /**
   * Advanced transcript analysis using GPT-4
   */
  private async analyzeTranscript(
    transcript: string,
    userId: string,
    paymentContext?: any,
  ) {
    const userProfile = await this.getUserSpendingProfile(userId);

    const prompt = `
Analyze this voice memo from a user who just made a payment:

Payment Context: ${JSON.stringify(paymentContext)}
User Profile: ${JSON.stringify(userProfile)}
Transcript: "${transcript}"

Please analyze:
1. Sentiment (positive/negative/neutral)
2. Intent (payment_note/reminder/budget_concern/expense_regret/future_planning)
3. Named entities (amounts, categories, merchants, people, dates, emotions)
4. Emotional indicators and spending psychology

Respond in JSON format with detailed confidence scores.
    `;

    const response = await this.httpService
      .post(
        `${this.NLP_API_URL}/chat/completions`,
        {
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content:
                'You are an expert in behavioral finance and natural language processing. Analyze voice memos for spending psychology insights.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
        },
        {
          headers: {
            Authorization: `Bearer ${this.config.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
        },
      )
      .toPromise();

    const analysis = JSON.parse(response.data.choices[0].message.content);

    return {
      sentiment: analysis.sentiment || 'neutral',
      intent: {
        type: analysis.intent?.type || 'payment_note',
        confidence: analysis.intent?.confidence || 0.5,
        actionable: analysis.intent?.actionable || false,
      },
      entities: analysis.entities || [],
    };
  }

  /**
   * Analyze emotional spending patterns
   */
  private async analyzeEmotionalSpending(
    transcript: string,
    userId: string,
  ): Promise<EmotionalSpendingInsight> {
    // Emotion detection keywords
    const emotionKeywords = {
      happy: ['excited', 'love', 'great', 'awesome', 'perfect', 'amazing'],
      stressed: ['need', 'urgent', 'quickly', 'rushing', 'pressure'],
      guilty: ['shouldnt', 'expensive', 'too much', 'regret', 'mistake'],
      worried: ['hope', 'hopefully', 'careful', 'budget', 'saving'],
      excited: ['cant wait', 'finally', 'treat', 'deserve', 'celebration'],
    };

    // Impulsivity indicators
    const impulsivityWords = [
      'suddenly',
      'just saw',
      'immediately',
      'right now',
      'impulse',
    ];

    // Regret indicators
    const regretWords = [
      'shouldnt have',
      'too expensive',
      'regret',
      'mistake',
      'overspent',
    ];

    // Planning indicators
    const planningWords = [
      'planned',
      'budgeted',
      'saved for',
      'needed',
      'research',
    ];

    const lowerTranscript = transcript.toLowerCase();

    // Detect primary emotion
    let primaryEmotion: EmotionalSpendingInsight['primaryEmotion'] = 'neutral';
    let maxScore = 0;

    for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
      const score = keywords.filter((keyword) =>
        lowerTranscript.includes(keyword),
      ).length;
      if (score > maxScore) {
        maxScore = score;
        primaryEmotion = emotion as EmotionalSpendingInsight['primaryEmotion'];
      }
    }

    // Calculate scores
    const impulsivity = Math.min(
      impulsivityWords.filter((word) => lowerTranscript.includes(word)).length /
        3,
      1,
    );

    const regretLevel = Math.min(
      regretWords.filter((word) => lowerTranscript.includes(word)).length / 3,
      1,
    );

    const planningIndicator = Math.min(
      planningWords.filter((word) => lowerTranscript.includes(word)).length / 3,
      1,
    );

    // Extract spending triggers
    const spendingTriggers = [];
    if (
      lowerTranscript.includes('sale') ||
      lowerTranscript.includes('discount')
    ) {
      spendingTriggers.push('discount_promotion');
    }
    if (
      lowerTranscript.includes('friend') ||
      lowerTranscript.includes('social')
    ) {
      spendingTriggers.push('social_influence');
    }
    if (
      lowerTranscript.includes('stress') ||
      lowerTranscript.includes('bad day')
    ) {
      spendingTriggers.push('emotional_relief');
    }

    return {
      primaryEmotion,
      impulsivity,
      regretLevel,
      planningIndicator,
      spendingTriggers,
    };
  }

  /**
   * Generate actionable insights from voice analysis
   */
  private async generateActionableInsights(
    transcript: string,
    nlpAnalysis: any,
    emotionalInsights: EmotionalSpendingInsight,
  ): Promise<VoiceInsight[]> {
    const insights: VoiceInsight[] = [];

    // High impulsivity insight
    if (emotionalInsights.impulsivity > 0.7) {
      insights.push({
        type: 'emotional_trigger',
        message:
          'This seems like an impulse purchase. Consider waiting 24 hours before similar purchases.',
        confidence: 0.8,
        actionable: true,
        suggestedAction:
          'Set up a 24-hour cooling-off period for non-essential purchases.',
      });
    }

    // High regret insight
    if (emotionalInsights.regretLevel > 0.6) {
      insights.push({
        type: 'regret_indicator',
        message:
          "You sound like you might regret this purchase. Let's set up better spending controls.",
        confidence: 0.75,
        actionable: true,
        suggestedAction:
          'Review and adjust your spending limits for this category.',
      });
    }

    // Planning insight
    if (emotionalInsights.planningIndicator > 0.6) {
      insights.push({
        type: 'spending_pattern',
        message:
          "Great job planning this purchase! You're building healthy spending habits.",
        confidence: 0.9,
        actionable: false,
      });
    }

    // Future intent detection
    if (nlpAnalysis.intent.type === 'future_planning') {
      insights.push({
        type: 'future_intent',
        message:
          'You mentioned future spending plans. Should we help you budget for this?',
        confidence: nlpAnalysis.intent.confidence,
        actionable: true,
        suggestedAction: 'Create a savings goal for your planned purchase.',
      });
    }

    return insights;
  }

  /**
   * Store voice insights for machine learning
   */
  private async storeVoiceInsights(
    userId: string,
    insights: VoiceProcessingResult,
  ) {
    // Store insights in analytics table for ML training
    try {
      await this.prisma.$executeRaw`
        INSERT INTO voice_analytics (
          user_id,
          primary_emotion,
          impulsivity_score,
          regret_level,
          planning_indicator,
          spending_triggers,
          created_at
        ) VALUES (
          ${userId},
          ${insights.spendingEmotions.primaryEmotion},
          ${insights.spendingEmotions.impulsivity},
          ${insights.spendingEmotions.regretLevel},
          ${insights.spendingEmotions.planningIndicator},
          ${JSON.stringify(insights.spendingEmotions.spendingTriggers)},
          NOW()
        )
      `;
    } catch (error) {
      this.logger.error('Failed to store voice insights:', error);
    }
  }

  // Helper methods
  private calculateWhisperConfidence(result: any): number {
    // Whisper doesn't provide direct confidence, estimate from segments
    if (result.segments) {
      const avgConfidence =
        result.segments.reduce((sum, seg) => {
          return sum + (seg.no_speech_prob ? 1 - seg.no_speech_prob : 0.8);
        }, 0) / result.segments.length;
      return Math.min(avgConfidence, 1);
    }
    return 0.8; // Default confidence
  }

  private async googleSpeechToText(audioBuffer: Buffer, mimeType: string) {
    // Implement Google Speech-to-Text as fallback
    // For now, return mock response
    return {
      text: '[Google STT not implemented]',
      confidence: 0.5,
      language: 'en',
    };
  }

  private async getUserSpendingProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        categories: true,
        paymentIntents: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return {
      totalCategories: user?.categories.length || 0,
      recentTransactions: user?.paymentIntents.length || 0,
      avgAmount:
        user?.paymentIntents.reduce((sum, p) => sum + Number(p.amount), 0) /
        (user?.paymentIntents.length || 1),
    };
  }
}
