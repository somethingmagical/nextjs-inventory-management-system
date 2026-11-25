import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { requirePermission } from "@/lib/authorization";
import { PERMISSION } from "@/lib/permissions";
import { getBusinessInsightFacts } from "@/features/business-insights/data";
import {
  businessInsightModelOutputSchema,
  businessInsightsResponseSchema,
} from "@/features/business-insights/schema";

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST() {
  const access = await requirePermission(PERMISSION.viewBusinessInsights);
  if (access.status === "unauthenticated") {
    return jsonResponse({ error: "Authentication required." }, 401);
  }
  if (access.status === "forbidden") {
    return jsonResponse({ error: "You do not have permission to view business insights." }, 403);
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return jsonResponse({ error: "AI insights are not configured. Set OPENAI_API_KEY on the server." }, 503);
  }

  let factsResult: Awaited<ReturnType<typeof getBusinessInsightFacts>>;
  try {
    factsResult = await getBusinessInsightFacts();
  } catch (error) {
    console.error(
      "Business insight data could not be loaded.",
      error instanceof Error ? { type: error.name } : { type: "unknown" },
    );
    return jsonResponse({ error: "Business insight data could not be loaded. Please try again." }, 500);
  }
  const { facts } = factsResult;
  if (facts.length === 0) {
    return jsonResponse(businessInsightsResponseSchema.parse({
      generatedAt: new Date().toISOString(),
      facts: [],
      recommendations: [],
    }));
  }

  // For Vercel AI Gateway, use AI_GATEWAY_API_KEY, set baseURL to https://ai-gateway.vercel.sh/v1, and use a provider/model ID below.
  const openai = new OpenAI({
    apiKey,
    timeout: 20_000,
    maxRetries: 0,
  });

  try {
    const response = await openai.responses.parse({
      model: process.env.OPENAI_BUSINESS_INSIGHTS_MODEL?.trim() || "gpt-4.1-mini",
      store: false,
      max_output_tokens: 400,
      input: [
        {
          role: "system",
          content:
            "You provide concise operational recommendations for an inventory business. "
            + "You receive only application-calculated facts. Select at most four facts that merit attention. "
            + "For each selected fact, suggest one cautious, practical next step. "
            + "Do not repeat or calculate numbers, infer causes, claim profit, or introduce facts not supplied. "
            + "Use only the supplied fact IDs and do not recommend actions that modify records automatically. "
            + "If no fact merits attention, return an empty recommendations array.",
        },
        {
          role: "user",
          content: JSON.stringify(facts.map(({ id, title, evidence }) => ({
            id,
            title,
            evidence,
          }))),
        },
      ],
      text: {
        format: zodTextFormat(businessInsightModelOutputSchema, "business_insights"),
      },
    });

    if (!response.output_parsed) {
      console.error("OpenAI returned no structured business insight output.");
      return jsonResponse({ error: "The AI provider did not return usable insights. Please try again." }, 502);
    }

    const parsed = businessInsightModelOutputSchema.safeParse(response.output_parsed);
    if (!parsed.success) {
      console.error("OpenAI returned business insight output that did not match the expected schema.");
      return jsonResponse({ error: "The AI provider returned an unsupported response. Please try again." }, 502);
    }

    const factIds = new Set(facts.map(({ id }) => id));
    const recommendationIds = new Set<string>();
    for (const recommendation of parsed.data.recommendations) {
      if (!factIds.has(recommendation.factId) || recommendationIds.has(recommendation.factId)) {
        console.error("OpenAI returned business insight references that did not match supplied facts.");
        return jsonResponse({ error: "The AI provider returned an unsupported response. Please try again." }, 502);
      }
      recommendationIds.add(recommendation.factId);
    }

    return jsonResponse(businessInsightsResponseSchema.parse({
      generatedAt: new Date().toISOString(),
      facts,
      recommendations: parsed.data.recommendations,
    }));
  } catch (error) {
    const details = error instanceof OpenAI.APIError
      ? {
          status: error.status,
          code: error.code,
          requestId: error.requestID,
        }
      : { type: error instanceof Error ? error.name : "unknown" };
    console.error("OpenAI business insight generation failed.", details);
    const diagnostic = error instanceof OpenAI.APIError
      ? error.message
          .replaceAll(apiKey, "[redacted]")
          .replace(/\s+/g, " ")
          .slice(0, 240)
      : `The request failed (${details.type}).`;
    return jsonResponse({
      error: `Business insights could not be generated right now. ${diagnostic} Please try again.`,
    }, 502);
  }
}
