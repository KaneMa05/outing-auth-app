const fs = require("fs");

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.log("SUPABASE_URL or SUPABASE_ANON_KEY is empty. Keeping local config.js if it exists.");
  if (!fs.existsSync("config.js")) {
    fs.writeFileSync(
      "config.js",
      'window.OUTING_APP_CONFIG = { supabaseUrl: "", supabaseAnonKey: "" };\n'
    );
  }
  process.exit(0);
}

fs.writeFileSync(
  "config.js",
  `window.OUTING_APP_CONFIG = {
  supabaseUrl: ${JSON.stringify(supabaseUrl)},
  supabaseAnonKey: ${JSON.stringify(supabaseAnonKey)},
};\n`
);

console.log("Generated config.js from Vercel environment variables.");
