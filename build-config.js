const fs = require("fs");
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";

for (const file of ["shared.js", "student.js", "teacher.js"]) {
  if (!fs.existsSync(file)) {
    throw new Error(`${file} is missing.`);
  }
}

if (!supabaseUrl || !supabaseAnonKey) {
  if (process.env.VERCEL === "1" || ["production", "preview"].includes(process.env.VERCEL_ENV)) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required for deployment. Existing config.js was not changed.");
  }
  console.log("SUPABASE_URL or SUPABASE_ANON_KEY is empty. Writing empty config.js.");
  fs.writeFileSync(
    "config.js",
    'window.OUTING_APP_CONFIG = { supabaseUrl: "", supabaseAnonKey: "" };\n'
  );
  process.exit(0);
}

if (process.env.VERCEL === "1" || ["production", "preview"].includes(process.env.VERCEL_ENV)) {
  let url;
  try { url = new URL(supabaseUrl); } catch { /* Do not disclose configuration values in build logs. */ }
  if (!url || url.protocol !== "https:" || url.username || url.password) {
    throw new Error("SUPABASE_URL must be a valid HTTPS URL for deployment.");
  }
}

fs.writeFileSync(
  "config.js",
  `window.OUTING_APP_CONFIG = {
  supabaseUrl: ${JSON.stringify(supabaseUrl)},
  supabaseAnonKey: ${JSON.stringify(supabaseAnonKey)},
};\n`
);

console.log("Generated config.js from Vercel environment variables.");
