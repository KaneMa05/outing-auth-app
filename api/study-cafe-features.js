const { uploadQuestionImages, signQuestionImages, deleteQuestionImages } = require("./question-board")._private;

function fail(code, status = 400) { return Object.assign(new Error(code), { status }); }
function featureId(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) throw fail("invalid_feature_id");
  return value.toLowerCase();
}
function required(value, max) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < 2 || text.length > max) throw fail("invalid_feature_content");
  return text;
}
async function requireFeature(store, id, admin = false) {
  const row = await store.findFeature(featureId(id));
  if (!row || (!admin && !row.is_published)) throw fail("feature_not_found", 404);
  return row;
}
async function serializeFeature(row, store, withImages = false) {
  return {
    id: row.id, title: row.title, description: row.description, question: row.question,
    isPublished: row.is_published, isHighlighted: Boolean(row.highlighted_at),
    createdAt: row.created_at, updatedAt: row.updated_at,
    images: withImages ? await store.featureImages(row.image_paths || []) : [],
  };
}
async function handleStudyCafeFeatures({ action, body, store, admin = false, now = new Date() }) {
  if (action === "feature_list") {
    const offset = Number(body.offset || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000) throw fail("invalid_feature_page");
    const rows = await store.listFeatures(admin, offset);
    const page = rows.slice(0, 20).filter((row) => admin || row.is_published);
    const active = await store.activeFeature();
    return { ok: true, items: await Promise.all(page.map((row) => serializeFeature(row, store))), activeId: active?.id || "", nextOffset: rows.length > 20 ? offset + 20 : null };
  }
  if (action === "feature_detail") {
    return { ok: true, feature: await serializeFeature(await requireFeature(store, body.featureId, admin), store, true) };
  }
  if (!admin) throw fail("forbidden", 403);
  if (action === "feature_highlight") {
    const row = await requireFeature(store, body.featureId, true);
    if (!row.is_published) throw fail("feature_must_be_published");
    await store.updateFeature(row.id, { highlighted_at: now.toISOString() });
    return { ok: true };
  }
  if (action !== "feature_save") throw fail("unsupported_action");
  const id = featureId(body.featureId);
  const title = required(body.title, 120), description = required(body.description, 3000), question = required(body.question, 300);
  if (typeof body.isPublished !== "boolean") throw fail("invalid_feature_visibility");
  const previous = await store.findFeature(id);
  const previousPaths = [...(previous?.image_paths || [])];
  const retained = body.retainedImagePaths || [];
  if (!Array.isArray(retained) || new Set(retained).size !== retained.length || retained.some((p) => !previousPaths.includes(p))) throw fail("invalid_feature_images");
  if (!Array.isArray(body.images || []) || retained.length + (body.images || []).length > 3) throw fail("too_many_images");
  const uploaded = await store.uploadFeatureImages(body.images || [], id);
  try {
    const row = { id, title, description, question, is_published: body.isPublished, image_paths: [...retained, ...uploaded], updated_at: now.toISOString() };
    if (previous) await store.updateFeature(id, row);
    else await store.insertFeature({ ...row, created_at: now.toISOString() });
  } catch (error) { await store.deleteFeatureImages(uploaded); throw error; }
  await store.deleteFeatureImages(previousPaths.filter((p) => !retained.includes(p)));
  return { ok: true, feature: await serializeFeature(await store.findFeature(id), store, true) };
}
function createRemoteFeatureStore(request) {
  return {
    async findFeature(id) { return (await request("GET", `study_cafe_feature_previews?id=eq.${id}&select=*&limit=1`))?.[0] || null; },
    listFeatures(admin, offset) { return request("GET", `study_cafe_feature_previews?select=*&order=created_at.desc,id.desc&limit=21&offset=${offset}${admin ? "" : "&is_published=eq.true"}`); },
    async activeFeature() { return (await request("GET", "study_cafe_feature_previews?is_published=eq.true&highlighted_at=not.is.null&select=id&order=highlighted_at.desc,id.desc&limit=1"))?.[0] || null; },
    insertFeature(row) { return request("POST", "study_cafe_feature_previews", row, { Prefer: "return=minimal" }); },
    updateFeature(id, row) { return request("PATCH", `study_cafe_feature_previews?id=eq.${id}`, row, { Prefer: "return=minimal" }); },
    uploadFeatureImages(images, id) { return uploadQuestionImages(images, "feature-previews", id); },
    featureImages: signQuestionImages,
    deleteFeatureImages: deleteQuestionImages,
  };
}
module.exports = { handleStudyCafeFeatures, createRemoteFeatureStore, requireFeature };
