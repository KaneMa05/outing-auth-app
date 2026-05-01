const fs = require("fs");
const path = require("path");

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
const outputDir = "public";

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

for (const file of ["index.html", "teacher.html", "app.js", "styles.css"]) {
  fs.copyFileSync(file, path.join(outputDir, file));
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.log("SUPABASE_URL or SUPABASE_ANON_KEY is empty. Writing empty public/config.js.");
  fs.writeFileSync(
    path.join(outputDir, "config.js"),
    'window.OUTING_APP_CONFIG = { supabaseUrl: "", supabaseAnonKey: "" };\n'
  );
  process.exit(0);
}

fs.writeFileSync(
  path.join(outputDir, "config.js"),
  `window.OUTING_APP_CONFIG = {
  supabaseUrl: ${JSON.stringify(supabaseUrl)},
  supabaseAnonKey: ${JSON.stringify(supabaseAnonKey)},
};\n`
);

console.log("Generated config.js from Vercel environment variables.");
