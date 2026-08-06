const crypto = require("crypto");
const fs = require("fs");

const SUBJECTS = ["해양경찰학개론", "해사법규", "형사법", "해사영어", "항해학", "기관학", "형사법(공판)"];

function handleLocalQuestionBoard({ body, student, filePath }) {
  const action = text(body.action, 40);
  const store = readStore(filePath);
  const now = new Date().toISOString();
  const ownPost = () => store.posts.find((post) => post.id === text(body.postId, 64) && post.studentId === student.id && !post.deletedAt);
  const visiblePost = () => store.posts.find((post) => post.id === text(body.postId, 64) && !post.deletedAt && !post.isHidden);

  if (action === "subjects") return success({ subjects: SUBJECTS });

  if (action === "list") {
    const subject = text(body.subject, 40);
    const status = text(body.status, 20);
    const search = text(body.search, 120).toLocaleLowerCase("ko");
    const posts = store.posts
      .filter((post) => !post.deletedAt && !post.isHidden)
      .filter((post) => !subject || post.subject === subject)
      .filter((post) => !status || post.status === status)
      .filter((post) => !search || `${post.title} ${post.body}`.toLocaleLowerCase("ko").includes(search))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((post) => serializePost(post, store, student.id));
    return success({ posts });
  }

  if (action === "detail") {
    const post = visiblePost();
    if (!post) return failure(404, "post_not_found");
    post.viewCount += 1;
    writeStore(filePath, store);
    return success({
      post: serializePost(post, store, student.id),
      comments: store.comments
        .filter((comment) => comment.postId === post.id && !comment.deletedAt && !comment.isHidden)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((comment) => serializeComment(comment, student.id)),
    });
  }

  if (action === "create") {
    const subject = text(body.subject, 40);
    const title = text(body.title, 120);
    const content = text(body.body, 5000, true);
    if (!SUBJECTS.includes(subject)) return failure(400, "invalid_subject");
    if (title.length < 2) return failure(400, "invalid_title");
    if (content.length < 2) return failure(400, "invalid_body");
    const images = localImages(body.images);
    if (!images) return failure(400, "invalid_image");
    const post = {
      id: crypto.randomUUID(), studentId: student.id, authorName: student.name || "인강생 미리보기",
      subject, title, body: content, images, status: "open", viewCount: 0, isHidden: false,
      createdAt: now, updatedAt: now, deletedAt: "",
    };
    store.posts.unshift(post);
    writeStore(filePath, store);
    return success({ postId: post.id }, 201);
  }

  if (action === "update") {
    const post = ownPost();
    if (!post) return failure(404, "post_not_found");
    const subject = text(body.subject, 40);
    const title = text(body.title, 120);
    const content = text(body.body, 5000, true);
    if (!SUBJECTS.includes(subject)) return failure(400, "invalid_subject");
    if (title.length < 2) return failure(400, "invalid_title");
    if (content.length < 2) return failure(400, "invalid_body");
    const retained = Array.isArray(body.retainedImagePaths)
      ? (post.images || []).filter((image) => body.retainedImagePaths.includes(image.path))
      : (post.images || []);
    const added = localImages(body.images);
    if (!added || retained.length + added.length > 3) return failure(400, "too_many_images");
    Object.assign(post, { subject, title, body: content, images: [...retained, ...added], updatedAt: now });
    writeStore(filePath, store);
    return success({ postId: post.id });
  }

  if (action === "delete") {
    const post = ownPost();
    if (!post) return failure(404, "post_not_found");
    post.deletedAt = now;
    post.updatedAt = now;
    writeStore(filePath, store);
    return success();
  }

  if (action === "comment_create") {
    const post = visiblePost();
    const content = text(body.body, 2000, true);
    if (!post) return failure(404, "post_not_found");
    if (content.length < 1) return failure(400, "invalid_comment");
    const comment = {
      id: crypto.randomUUID(), postId: post.id, studentId: student.id,
      authorType: "student", authorName: student.name || "인강생 미리보기", body: content,
      isHidden: false, createdAt: now, updatedAt: now, deletedAt: "",
    };
    store.comments.push(comment);
    post.status = "answered";
    post.updatedAt = now;
    writeStore(filePath, store);
    return success({ commentId: comment.id }, 201);
  }

  if (action === "comment_delete") {
    const comment = store.comments.find((item) => item.id === text(body.commentId, 64) && item.studentId === student.id && !item.deletedAt);
    if (!comment) return failure(404, "comment_not_found");
    comment.deletedAt = now;
    comment.updatedAt = now;
    writeStore(filePath, store);
    return success();
  }

  if (action === "resolve") {
    const post = ownPost();
    if (!post) return failure(404, "post_not_found");
    post.status = body.answered === false ? "open" : "answered";
    post.updatedAt = now;
    writeStore(filePath, store);
    return success();
  }

  if (action === "report") return success({ localPreview: true });
  return failure(400, "unsupported_action");
}

function serializePost(post, store, studentId) {
  return {
    id: post.id, subject: post.subject, title: post.title, body: post.body,
    imageCount: Array.isArray(post.images) ? post.images.length : 0,
    images: (post.images || []).map((image) => ({ path: image.path, url: image.data })),
    status: post.status, viewCount: Number(post.viewCount) || 0,
    commentCount: store.comments.filter((comment) => comment.postId === post.id && !comment.deletedAt && !comment.isHidden).length,
    authorName: post.authorName, isOwn: post.studentId === studentId, isHidden: false,
    hiddenReason: "", createdAt: post.createdAt, updatedAt: post.updatedAt,
  };
}

function localImages(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 3) return null;
  const images = [];
  for (const image of value) {
    const data = String(image?.data || "");
    const contentType = String(image?.contentType || "").toLowerCase();
    if (!/^image\/(?:jpeg|png|webp)$/.test(contentType) || !data.startsWith(`data:${contentType};base64,`)) return null;
    images.push({ path: `local/${crypto.randomUUID()}.jpg`, data, contentType });
  }
  return images;
}

function serializeComment(comment, studentId) {
  return {
    id: comment.id, authorType: comment.authorType, authorName: comment.authorName,
    body: comment.body, isOwn: comment.studentId === studentId, isHidden: false,
    hiddenReason: "", createdAt: comment.createdAt, updatedAt: comment.updatedAt,
  };
}

function readStore(filePath) {
  if (!fs.existsSync(filePath)) return { posts: [], comments: [] };
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8") || "{}");
    return {
      posts: Array.isArray(value.posts) ? value.posts : [],
      comments: Array.isArray(value.comments) ? value.comments : [],
    };
  } catch {
    return { posts: [], comments: [] };
  }
}

function writeStore(filePath, store) {
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2));
}

function text(value, maxLength, preserveLines = false) {
  const normalized = String(value || "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
  return preserveLines ? normalized : normalized.replace(/\s+/g, " ");
}

function success(payload = {}, status = 200) {
  return { status, payload: { ok: true, localPreview: true, ...payload } };
}

function failure(status, error) {
  return { status, payload: { ok: false, error } };
}

module.exports = { SUBJECTS, handleLocalQuestionBoard };
