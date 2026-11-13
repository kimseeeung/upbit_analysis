/**
 * 배포 플랫폼 연동 어댑터 (12.3). 실제 플랫폼 API는 여기만 바꾸면 된다.
 * - console: 개발·테스트용. 아무것도 배포하지 않고 기록만 (기본값)
 * - webhook: DEPLOY_WEBHOOK_URL로 { version } 을 POST. 토큰은 DEPLOY_WEBHOOK_TOKEN
 *   (배포 플랫폼의 "이전 배포로 되돌리기" 훅이나 CI 작업을 부르는 용도)
 */
export interface DeployAdapter {
  readonly name: string;
  /** 지정 버전을 다시 배포한다. 실패하면 throw */
  deploy(version: string): Promise<void>;
}

class ConsoleDeployAdapter implements DeployAdapter {
  readonly name = "console";
  async deploy(version: string) {
    console.info(`[deploy:console] ${version} 재배포 요청 (실제 배포 없음)`);
  }
}

class WebhookDeployAdapter implements DeployAdapter {
  readonly name = "webhook";
  constructor(
    private url: string,
    private token: string | undefined,
  ) {}
  async deploy(version: string) {
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify({ version }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`배포 요청 실패 (HTTP ${res.status})`);
  }
}

let override: DeployAdapter | null = null;
/** 테스트에서 실패하는 어댑터 등으로 바꿀 때 */
export function setDeployAdapterForTest(a: DeployAdapter | null) {
  override = a;
}

export function getDeployAdapter(): DeployAdapter {
  if (override) return override;
  const provider = process.env.DEPLOY_PROVIDER ?? "console";
  switch (provider) {
    case "console":
      return new ConsoleDeployAdapter();
    case "webhook": {
      const url = process.env.DEPLOY_WEBHOOK_URL;
      if (!url) throw new Error("DEPLOY_WEBHOOK_URL이 설정되지 않았습니다");
      return new WebhookDeployAdapter(url, process.env.DEPLOY_WEBHOOK_TOKEN);
    }
    default:
      throw new Error(`지원하지 않는 DEPLOY_PROVIDER: ${provider}`);
  }
}
