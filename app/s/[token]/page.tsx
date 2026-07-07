import { createClient } from "@/lib/supabase/server";
import { SurveyForm } from "./survey-form";

export const dynamic = "force-dynamic";

type SurveyPage = {
  responded: boolean;
  score: number | null;
  comment: string | null;
  routed_to: "review_request" | "private_followup" | null;
  clinic_name: string | null;
  doctor_name: string | null;
  google_review_url: string | null;
};

/** Quiet, self-contained shell for the anon survey (no app chrome). */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-white px-5 py-10">
      {children}
      <p className="mt-10 text-center text-xs text-text-secondary">
        Powered by GrowthOS
      </p>
    </main>
  );
}

export default async function SurveyPublicPage({
  params,
}: {
  params: { token: string };
}) {
  const supabase = createClient();
  // Anon, token-scoped read via SECURITY DEFINER RPC. A bad/blank token returns
  // no rows — nothing else about the clinic or patient is exposed.
  const { data } = await supabase.rpc("get_survey_page_by_token", {
    p_token: params.token,
  });
  const survey = (Array.isArray(data) ? data[0] : null) as SurveyPage | null;

  // Unknown token → a plain, non-leaky message (no notFound 404 chrome).
  if (!survey) {
    return (
      <Shell>
        <div className="text-center">
          <p className="text-2xl">🔗</p>
          <h1 className="mt-3 text-xl font-semibold tracking-[-0.02em] text-text-primary">
            This survey link isn&apos;t valid
          </h1>
          <p className="mt-2 text-[15px] text-text-secondary">
            The link may be old or mistyped. Please check with the clinic.
          </p>
        </div>
      </Shell>
    );
  }

  const clinicName = survey.clinic_name?.trim() || "our clinic";

  // Already answered → thank them, don't let the token be reused.
  if (survey.responded) {
    return (
      <Shell>
        <div className="text-center">
          <p className="text-3xl">🙏</p>
          <h1 className="mt-3 text-xl font-semibold tracking-[-0.02em] text-text-primary">
            Thank you, already recorded.
          </h1>
          <p className="mt-2 text-[15px] text-text-secondary">
            We&apos;ve got your response for {clinicName}. Aapke feedback ke liye
            shukriya!
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <SurveyForm
        token={params.token}
        clinicName={clinicName}
        doctorName={survey.doctor_name?.trim() || ""}
        reviewUrl={survey.google_review_url?.trim() || ""}
      />
    </Shell>
  );
}
