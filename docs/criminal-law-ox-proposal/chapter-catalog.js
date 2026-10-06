// Learner-only grouping. Keep original question IDs/chapter IDs for all server writes.
function learningCatalog(catalog) {
  const memberIds = [
    'criminal-law-10-punishment-types',
    'criminal-law-11-sentencing',
    'criminal-law-12-recidivism',
    'criminal-law-13-suspension',
    'criminal-law-14-limitation-extinction',
  ];
  const members = catalog.chapters.filter(c => c.collection_id === 'criminal-law' && memberIds.includes(c.id));
  if (!members.length) return { ...catalog, chapters: [...catalog.chapters] };
  members.sort((a, b) => memberIds.indexOf(a.id) - memberIds.indexOf(b.id));
  const combined = {
    ...members[0], display_name: '형별론', chapter_title: '형별론', sort_order: 10,
    source_chapter_ids: members.flatMap(c => c.source_chapter_ids || [c.id]),
    question_count: members.reduce((sum, c) => sum + c.question_count, 0),
    end_page: members.at(-1).end_page,
  };
  return { ...catalog, chapters: catalog.chapters.flatMap(c =>
    c.id === members[0].id ? [combined] : members.includes(c) ? [] : [c]) };
}

function learningChapterEntries(list) {
  return list.flatMap(c => (c.source_chapter_ids || [c.id]).map(id => [id, c]));
}
