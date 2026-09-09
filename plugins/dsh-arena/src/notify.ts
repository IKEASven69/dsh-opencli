/**
 * 比赛通知适配器：飞书 / 钉钉 自定义机器人 webhook（免企业应用）。
 * 签名规范（官方文档）：
 * - 钉钉加签：timestamp(ms) + "\n" + secret 作 HMAC-SHA256 key，对空串签名，base64 → query 参数
 * - 飞书加签：timestamp(s) + "\n" + secret 作 HMAC-SHA256 key，对空串签名，base64 → body 的 sign 字段
 * 空转安全：webhook 未配置时静默跳过（返回 skipped）。
 */
import { createHmac } from "node:crypto";

export interface RobotConfig {
  webhook: string;
  secret?: string;
}

export interface NotifyConfig {
  feishu?: RobotConfig;
  dingtalk?: RobotConfig;
  /** 出站卡片里「查看裁决」按钮的目标页（如 dsh web 面板地址）；缺省不带按钮 */
  panelUrl?: string;
}

export interface RaceSummary {
  runId: string;
  task: string;
  autoWinner: string | null;
  mergedMember: string | null;
  members: { name: string; verdict: string; durationMs: number }[];
}

function dingSign(secret: string, timestamp: number): string {
  const stringToSign = `${timestamp}\n${secret}`;
  return createHmac("sha256", stringToSign).update("").digest("base64");
}

function feishuSign(secret: string, timestamp: number): string {
  const stringToSign = `${timestamp}\n${secret}`;
  return createHmac("sha256", stringToSign).update("").digest("base64");
}

export function renderRaceText(s: RaceSummary): string {
  const lines = [
    `**比武台 · 比赛 ${s.runId} 结束**`,
    `任务：${s.task}`,
    ...s.members.map((m) => `- ${m.name}：${m.verdict}（${Math.round(m.durationMs / 1000)}s）`),
    s.mergedMember
      ? `🏆 自动裁决：**${s.mergedMember}** 已合并进主干`
      : s.autoWinner
        ? `自动规则选出 ${s.autoWinner}（未合并，等人工确认）`
        : "⚠ 无人通过验收，交人工裁决",
  ];
  return lines.join("\n");
}

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`webhook ${res.status}: ${await res.text().then((t) => t.slice(0, 200))}`);
}

export interface NotifyOutcome {
  dingtalk: "sent" | "skipped" | "error";
  feishu: "sent" | "skipped" | "error";
  errors: string[];
}

export async function notifyRaceFinished(cfg: NotifyConfig, s: RaceSummary): Promise<NotifyOutcome> {
  const outcome: NotifyOutcome = { dingtalk: "skipped", feishu: "skipped", errors: [] };
  const text = renderRaceText(s);

  if (cfg.dingtalk?.webhook) {
    try {
      const ts = Date.now();
      let url = cfg.dingtalk.webhook;
      if (cfg.dingtalk.secret) {
        url += `&timestamp=${ts}&sign=${encodeURIComponent(dingSign(cfg.dingtalk.secret, ts))}`;
      }
      const btns = cfg.panelUrl ? [{ title: "查看裁决", actionURL: cfg.panelUrl }] : [];
      await postJson(url, {
        msgtype: "actionCard",
        actionCard: {
          title: `比武台 ${s.runId} 结束`,
          text: `${text}\n\n${cfg.panelUrl ? `[查看裁决](${cfg.panelUrl})` : ""}`,
          btnOrientation: "0",
          btns,
        },
      });
      outcome.dingtalk = "sent";
    } catch (e) {
      outcome.dingtalk = "error";
      outcome.errors.push(`dingtalk: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (cfg.feishu?.webhook) {
    try {
      const ts = Math.floor(Date.now() / 1000);
      const body: Record<string, unknown> = {
        timestamp: String(ts),
        msg_type: "text",
        content: { text },
      };
      if (cfg.feishu.secret) body.sign = feishuSign(cfg.feishu.secret, ts);
      await postJson(cfg.feishu.webhook, body);
      outcome.feishu = "sent";
    } catch (e) {
      outcome.feishu = "error";
      outcome.errors.push(`feishu: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return outcome;
}
