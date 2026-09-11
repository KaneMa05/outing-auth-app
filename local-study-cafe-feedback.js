const fs = require("fs");
const crypto = require("crypto");
const { normalizeQuestionImages } = require("./api/question-board")._private;
const { handleStudyCafeFeedback, canReadFeedback, PAGE_SIZE } = require("./api/study-cafe-feedback");

// A file shared by local preview sessions; production uses the authenticated API.
async function handleLocalStudyCafeFeedback({ body, student, filePath, admin = false }) {
  try {
    const rows = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : [];
    if (!Array.isArray(rows)) throw new Error("invalid_feedback_store");
    const featureFile = filePath.replace(/\.json$/, "-features.json");
    const features = fs.existsSync(featureFile) ? JSON.parse(fs.readFileSync(featureFile, "utf8")) : { rows: [], images: {} };
    const saveFeatures = () => fs.writeFileSync(featureFile, JSON.stringify(features, null, 2));
    const store = {
      async list(cursor, { studentId, admin: canReadAll, featureId = "" }) {
        return rows.filter((row) => !row.deleted_at && !row.is_hidden && canReadFeedback(row, studentId, canReadAll))
          .filter((row) => (row.feature_preview_id || "") === featureId)
          .filter((row) => !cursor || row.created_at < cursor.createdAt || (row.created_at === cursor.createdAt && row.id < cursor.id))
          .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
          .slice(0, PAGE_SIZE + 1);
      },
      async find(id, includeDeleted = false) { return rows.find((row) => row.id === id && (includeDeleted || !row.deleted_at) && !row.is_hidden) || null; },
      async deletePost(id, timestamp) {
        const post = rows.find((row) => row.id === id);
        Object.assign(post, { body: "삭제된 의견입니다.", deleted_at: post.deleted_at || timestamp, updated_at: timestamp });
        for (const reply of post.replies || []) {
          Object.assign(reply, { body: "삭제된 답글입니다.", deleted_at: reply.deleted_at || timestamp, updated_at: timestamp });
        }
        fs.writeFileSync(filePath, JSON.stringify(rows, null, 2));
      },
      async deleteReply(id, postId, timestamp) {
        const reply = rows.find((row) => row.id === postId)?.replies.find((row) => row.id === id);
        Object.assign(reply, { body: "삭제된 답글입니다.", deleted_at: timestamp, updated_at: timestamp });
        fs.writeFileSync(filePath, JSON.stringify(rows, null, 2));
      },
      async recentCount(studentId, since) { return rows.filter((row) => row.student_id === studentId && row.created_at >= since).length; },
      async insert(row) {
        if (!rows.some((item) => item.id === row.id)) rows.push(row);
        fs.writeFileSync(filePath, JSON.stringify(rows, null, 2));
      },
      async names() { return new Map(); },
      async listReplies(postId, cursor) {
        return (rows.find((row) => row.id === postId)?.replies || [])
          .filter((row) => !row.deleted_at && !row.is_hidden)
          .filter((row) => !cursor || row.created_at < cursor.createdAt || (row.created_at === cursor.createdAt && row.id < cursor.id))
          .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).slice(0, PAGE_SIZE + 1);
      },
      async findReply(id, includeDeleted = false) {
        return rows.flatMap((row) => row.replies || []).find((row) => row.id === id && (includeDeleted || !row.deleted_at) && !row.is_hidden) || null;
      },
      async recentReplyCount(studentId, canReplyAsAdmin, since) {
        return rows.flatMap((row) => row.replies || []).filter((row) => row.created_at >= since &&
          (canReplyAsAdmin ? row.author_type === "teacher" : row.author_type === "student" && row.student_id === studentId)).length;
      },
      async insertReply(reply) {
        const post = rows.find((row) => row.id === reply.post_id);
        if (!post) throw new Error("feedback_not_found");
        if (!post.replies) post.replies = [];
        if (!rows.some((row) => (row.replies || []).some((item) => item.id === reply.id))) post.replies.push(reply);
        fs.writeFileSync(filePath, JSON.stringify(rows, null, 2));
      },
      async findFeature(id) { return features.rows.find((row) => row.id === id) || null; },
      async listFeatures(canReadAll, offset) {
        return features.rows.filter((row) => canReadAll || row.is_published)
          .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).slice(offset, offset + 21);
      },
      async activeFeature() {
        return features.rows.filter((row) => row.is_published && row.highlighted_at)
          .sort((a, b) => b.highlighted_at.localeCompare(a.highlighted_at) || b.id.localeCompare(a.id))[0] || null;
      },
      async insertFeature(row) { features.rows.push(row); saveFeatures(); },
      async updateFeature(id, update) { Object.assign(features.rows.find((row) => row.id === id), update); saveFeatures(); },
      async uploadFeatureImages(images, id) {
        normalizeQuestionImages(images);
        const paths = images.map((image) => {
          const key = `feature-previews/${id}/${crypto.randomUUID()}.jpg`;
          features.images[key] = image.data;
          return key;
        });
        saveFeatures();
        return paths;
      },
      async featureImages(paths) { return paths.map((path) => ({ path, url: features.images[path] })); },
      async deleteFeatureImages(paths) { if (paths.length) { for (const path of paths) delete features.images[path]; saveFeatures(); } },
    };
    // Serialize local writes across await boundaries to avoid losing concurrent opinions.
    return { status: 200, payload: { ...await handleStudyCafeFeedback({ action: body.action, body, student, store, admin }), localPreview: true } };
  } catch (error) {
    return { status: error.status || 500, payload: { ok: false, error: error.message || "feedback_store_unavailable" } };
  }
}

let pending = Promise.resolve();
function queueLocalStudyCafeFeedback(options) {
  const result = pending.then(() => handleLocalStudyCafeFeedback(options));
  pending = result.catch(() => {});
  return result;
}

module.exports = { handleLocalStudyCafeFeedback: queueLocalStudyCafeFeedback };
