import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class WebhookAuthGuard implements CanActivate {
  private readonly logger = new Logger(WebhookAuthGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<any>();

    const enforce =
      (this.config.get<string>('DECENTRO_WEBHOOK_ENFORCE', 'false') ||
        'false') === 'true';
    const tokenHeader = (
      this.config.get<string>(
        'DECENTRO_WEBHOOK_TOKEN_HEADER',
        'x-webhook-token',
      ) || 'x-webhook-token'
    ).toLowerCase();
    const expectedToken = this.config.get<string>('DECENTRO_WEBHOOK_TOKEN');

    // Official scheme: X-Signature header, base64(HMAC-SHA256(raw body))
    const sigHeaderName = (
      this.config.get<string>(
        'DECENTRO_WEBHOOK_SIGNATURE_HEADER',
        'x-signature',
      ) || 'x-signature'
    ).toLowerCase();
    const providedSignature = (req.headers[sigHeaderName] as string) || '';
    const secret = this.config.get<string>('DECENTRO_WEBHOOK_SECRET');
    const algo = (
      this.config.get<string>('DECENTRO_WEBHOOK_ALGO', 'sha256') || 'sha256'
    ).toLowerCase();

    const raw = (req as any).rawBody
      ? (req as any).rawBody.toString('utf8')
      : JSON.stringify(req.body || {});

    // Strategy 1: HMAC signature verification if configured
    if (secret && providedSignature) {
      try {
        const base64Sig = crypto
          .createHmac(algo as any, secret)
          .update(raw)
          .digest('base64');
        const normalizedProvided = providedSignature.startsWith('sha256=')
          ? providedSignature.slice(7)
          : providedSignature;
        if (normalizedProvided === base64Sig) return true;
        // Accept hex variant if misconfigured (best-effort in dev)
        const hexSig = crypto
          .createHmac(algo as any, secret)
          .update(raw)
          .digest('hex');
        if (normalizedProvided === hexSig) return true;
        this.logger.warn('Webhook signature mismatch');
      } catch (e) {
        this.logger.warn('Webhook signature verification error', e as any);
      }
    }

    // Strategy 2: Static token header matching
    if (expectedToken) {
      const providedToken = (req.headers[tokenHeader] as string) || '';
      if (
        providedToken &&
        crypto.timingSafeEqual(
          Buffer.from(providedToken),
          Buffer.from(expectedToken),
        )
      ) {
        return true;
      }
      this.logger.warn('Webhook token mismatch');
    }

    if (!enforce) {
      this.logger.warn(
        'Webhook auth not enforced; accepting request for development',
      );
      return true;
    }

    return false;
  }
}
