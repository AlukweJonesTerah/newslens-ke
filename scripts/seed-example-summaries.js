// ==============================================
// IMPORTANT: THIS SCRIPT INSERTS PLACEHOLDER DATA
// FOR VISUAL QA ONLY. NOT REAL AI-GENERATED CONTENT
// DO NOT CONFUSE WITH PRODUCTION DATA
// ==============================================

require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

async function main() {
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey);

  const exampleStories = [
    {
      id: "101b8fad-e43c-415b-87fe-fc7ed1813d7e",
      title:
        "Speaker Wetang'ula Faces Possible Jail Term After Fresh Contempt Case",
      neutral_summary:
        "Multiple outlets report that National Assembly Speaker Moses Wetang'ula faces possible jail time after the High Court certified an urgent contempt of court case against him related to alleged breach of court orders concerning political campaigns.",
      coverage_category: "government_focused",
      per_source: {
        "Kenyans.co.ke":
          "Focused on the immediate urgency of the court case and the potential consequences for Wetang'ula.",
        "The Standard":
          "Emphasized the legal background of the court orders Wetang'ula is alleged to have breached.",
        "Tuko (politics)":
          "Led with the High Court's decision to certify the case as urgent, highlighting the timeline.",
        "Nation Africa":
          "Highlighted the political implications of the contempt case for Wetang'ula and the Kenya Kwanza government.",
      },
    },
    {
      id: "acf30c39-2428-4d76-a632-4823fd9c135d",
      title: "NTSA sounds alarm over uncollected logbooks as deadline nears",
      neutral_summary:
        "The National Transport and Safety Authority (NTSA) has warned that uncollected logbooks, number plates, and licences may be destroyed, giving owners a timeline to claim their documents before the deadline.",
      coverage_category: "public_focused",
      per_source: {
        "People Daily":
          "Emphasized the free collection process and the specific deadline given to vehicle owners.",
        "Tuko (all)":
          "Led with the dramatic warning of destruction to grab reader attention, then listed the steps for collection.",
        "Kenyans.co.ke":
          "Focused on the breadth of documents affected, including not just logbooks but also number plates and licences.",
      },
    },
    {
      id: "17e7571b-7c47-442b-b4b4-4c981f8ab750",
      title: "Why World Bank has delayed Sh78bn emergency loan to Kenya",
      neutral_summary:
        "Reports indicate the World Bank has delayed a Sh78 billion emergency loan to Kenya, which has impacted a fuel price cushion plan from the government.",
      coverage_category: "business_focused",
      per_source: {
        "Kenyans.co.ke":
          "Framed the story around how the delay has directly affected Ruto’s fuel price cushion plan for Kenyans.",
        "Business Daily Africa":
          "Dove deep into the economic details of the World Bank’s conditions and the timeline for the loan.",
      },
    },
  ];

  for (const story of exampleStories) {
    console.log(`Updating story ${story.id} (${story.title.slice(0, 50)}...)`);
    const { error } = await supabase
      .from("stories")
      .update({
        neutral_summary: story.neutral_summary,
        coverage_category: story.coverage_category,
        per_source: story.per_source,
        summary_updated_at: new Date().toISOString(),
      })
      .eq("id", story.id);
    if (error) {
      console.error("Error updating story:", story.id, error);
      process.exit(1);
    }
  }

  console.log("\n=== Placeholder data inserted successfully! ===\n");
  console.log("Reminder: This is hand-written test data, not real AI output!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
