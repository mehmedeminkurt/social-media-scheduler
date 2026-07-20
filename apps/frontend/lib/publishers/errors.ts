export class PublisherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublisherError";
  }
}

export class PublisherConfigError extends PublisherError {
  constructor(message = "Platform yapılandırması eksik veya geçersiz.") {
    super(message);
    this.name = "PublisherConfigError";
  }
}

export class PublisherAuthError extends PublisherError {
  constructor(message = "Platform erişim anahtarı geçersiz veya süresi dolmuş.") {
    super(message);
    this.name = "PublisherAuthError";
  }
}

export class PublisherValidationError extends PublisherError {
  constructor(message: string) {
    super(message);
    this.name = "PublisherValidationError";
  }
}

export class PublisherUnsupportedError extends PublisherError {
  constructor(platform: string) {
    super(`Desteklenmeyen yayın platformu: ${platform}`);
    this.name = "PublisherUnsupportedError";
  }
}

export class PublisherApiError extends PublisherError {
  readonly causeData?: unknown;

  constructor(message: string, causeData?: unknown) {
    super(message);
    this.name = "PublisherApiError";
    this.causeData = causeData;
  }
}
