import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const MAX_OUTPUT_TOKENS = 512;

export type CaptionSuggestContext = {
  companyName: string;
  brandKitName?: string | null;
  topic?: string;
  platforms: string[];
  mediaHint?: string;
};

export type CaptionSuggestResult = {
  caption: string;
  hashtags: string[];
};

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("AI servisi yapılandırılmamış.");
  }
  return new Anthropic({ apiKey });
}

function buildUserPrompt(context: CaptionSuggestContext): string {
  const lines = [
    `Şirket: ${context.companyName}`,
    `Platformlar: ${context.platforms.join(", ")}`,
  ];

  if (context.brandKitName) {
    lines.push(`Marka seti: ${context.brandKitName}`);
  }
  if (context.topic) {
		lines.push(`Konu / ana mesaj: ${context.topic}`);
	  }
  if (context.mediaHint) {
    lines.push(`Medya içeriği: ${context.mediaHint}`);
  }

  lines.push(
    "",
    "Türkçe, marka sesine uygun bir sosyal medya caption'ı ve 5-10 ilgili hashtag öner.",
    "Caption doğal ve paylaşılabilir olsun; hashtag'ler caption metninin sonuna eklenmemeli, ayrı liste olarak dönsün.",
  );

  return lines.join("\n");
}

function parseModelResponse(text: string): CaptionSuggestResult {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AI yanıtı işlenemedi.");
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    caption?: unknown;
    hashtags?: unknown;
  };

  if (typeof parsed.caption !== "string" || !parsed.caption.trim()) {
    throw new Error("AI geçerli bir caption üretemedi.");
  }

  const hashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
        .slice(0, 15)
    : [];

  return {
    caption: parsed.caption.trim().slice(0, 2200),
    hashtags,
  };
}

export async function suggestCaption(
  context: CaptionSuggestContext,
): Promise<CaptionSuggestResult> {
  const client = getClient();
  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  const response = await client.messages.create({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      "Sen Türkçe sosyal medya içerik uzmanısın.",
      "Marka sesine uygun, özgün ve profesyonel caption + hashtag önerileri üretirsin.",
      'Yanıtını yalnızca geçerli JSON olarak ver: {"caption":"...","hashtags":["#etiket1","#etiket2"]}',
      "Başka açıklama veya markdown ekleme.",
    ].join(" "),
    messages: [{ role: "user", content: buildUserPrompt(context) }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AI boş yanıt döndü.");
  }

  return parseModelResponse(textBlock.text);
}
