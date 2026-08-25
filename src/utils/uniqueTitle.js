import prisma from '../config/db.js';

/**
 * Generates a unique title for a user's document (PDF Resume or Studio Resume)
 * If 'First_Resume.pdf' exists, generates 'First_Resume (1).pdf', 'First_Resume (2).pdf', etc.
 */
export const getUniqueResumeTitle = async (userId, baseTitle = 'Resume.pdf') => {
  if (!baseTitle) baseTitle = 'Resume.pdf';

  const extIndex = baseTitle.lastIndexOf('.');
  const nameWithoutExt = extIndex > 0 ? baseTitle.substring(0, extIndex) : baseTitle;
  const ext = extIndex > 0 ? baseTitle.substring(extIndex) : '';

  // Check in documents table (parsed resumes)
  const existingDocs = await prisma.document.findMany({
    where: {
      userId,
      deletedAt: null,
      title: {
        startsWith: nameWithoutExt,
      },
    },
    select: { title: true },
  });

  // Check in studio resumes table
  const existingStudio = await prisma.studioResume.findMany({
    where: {
      userId,
      deletedAt: null,
      title: {
        startsWith: nameWithoutExt,
      },
    },
    select: { title: true },
  });

  const existingTitles = new Set([
    ...existingDocs.map((d) => d.title),
    ...existingStudio.map((s) => s.title),
  ]);

  if (!existingTitles.has(baseTitle)) {
    return baseTitle;
  }

  let counter = 1;
  while (existingTitles.has(`${nameWithoutExt} (${counter})${ext}`)) {
    counter++;
  }

  return `${nameWithoutExt} (${counter})${ext}`;
};
