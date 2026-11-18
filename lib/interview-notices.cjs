'use strict';

async function publishedInterviewNotices(read) {
  const rows = await read('GET', 'interview_notices?select=id,title,body,image_path,target_audience,is_published,created_at,updated_at&is_published=eq.true&order=created_at.desc,id.asc');
  const baseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  return (Array.isArray(rows) ? rows : [])
    .filter(row => row.is_published === true && row.target_audience === 'interview')
    .map(row => ({
      id: row.id,
      title: String(row.title || ''),
      body: String(row.body || ''),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      imageUrl: baseUrl && /^[a-zA-Z0-9_-]{1,120}\/[a-f0-9-]{36}\.jpg$/i.test(row.image_path || '')
        ? `${baseUrl}/storage/v1/object/public/notice-images/${row.image_path}` : '',
    }));
}

module.exports = { publishedInterviewNotices };
