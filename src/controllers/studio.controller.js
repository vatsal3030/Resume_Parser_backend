import prisma from '../config/db.js';
import logger from '../config/logger.js';

/**
 * Studio Controller
 * CRUD operations for studio_resumes and resume_templates.
 */

// ==================== TEMPLATES ====================

/**
 * GET /studio/templates
 * List all available resume templates.
 */
export const listTemplates = async (req, res) => {
  try {
    const templates = await prisma.resumeTemplate.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        thumbnailUrl: true,
        category: true,
        isFree: true,
        templateData: true,
      },
    });
    res.json(templates);
  } catch (error) {
    logger.error({ err: error }, 'Failed to list templates');
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
};

/**
 * GET /studio/templates/:id
 * Get a single template with full data.
 */
export const getTemplate = async (req, res) => {
  try {
    const template = await prisma.resumeTemplate.findUnique({
      where: { id: req.params.id },
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json(template);
  } catch (error) {
    logger.error({ err: error }, 'Failed to get template');
    res.status(500).json({ error: 'Failed to fetch template' });
  }
};

// ==================== STUDIO RESUMES ====================

/**
 * GET /studio/resumes
 * List all studio resumes for the current user.
 */
import redis from '../config/redis.js';

export const listStudioResumes = async (req, res) => {
  try {
    const cacheKey = `studio_resumes:${req.user.id}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const resumes = await prisma.studioResume.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        templateId: true,
        sectionOrder: true,
        styleConfig: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        template: {
          select: { name: true, category: true },
        },
      },
    });

    await redis.set(cacheKey, JSON.stringify(resumes), 'EX', 60);
    res.json(resumes);
  } catch (error) {
    logger.error({ err: error }, 'Failed to list studio resumes');
    res.status(500).json({ error: 'Failed to fetch resumes' });
  }
};

/**
 * POST /studio/resumes
 * Create a new studio resume.
 */
export const createStudioResume = async (req, res) => {
  try {
    const { title, templateId, resumeData, sectionOrder, styleConfig } = req.body;

    // If templateId provided, fetch template defaults
    let defaultStyle = {};
    let defaultOrder = ['personal', 'summary', 'experience', 'education', 'skills', 'projects', 'certifications'];

    if (templateId) {
      const template = await prisma.resumeTemplate.findUnique({ where: { id: templateId } });
      if (template?.templateData) {
        defaultStyle = template.templateData.style || {};
        defaultOrder = template.templateData.defaultSectionOrder || defaultOrder;
      }
    }

    // --- Auto-populate from Profile (Personalization) ---
    const userProfile = await prisma.profile.findUnique({
      where: { userId: req.user.id }
    });

    let defaultResumeData = resumeData || {};
    if (!resumeData && userProfile) {
      defaultResumeData = {
        personal: {
          name: req.user.name || '',
          email: req.user.email || '',
          phone: '',
          location: '',
          linkedin: userProfile.socialLinks?.linkedin || '',
          github: userProfile.socialLinks?.github || '',
          website: userProfile.socialLinks?.portfolio || '',
        },
        summary: userProfile.bio || '',
        skills: userProfile.skills || [],
        experience: [],
        education: [],
        projects: [],
        certifications: []
      };
    }

    const resume = await prisma.studioResume.create({
      data: {
        userId: req.user.id,
        title: title || 'Untitled Resume',
        templateId: templateId || null,
        resumeData: defaultResumeData,
        sectionOrder: sectionOrder || defaultOrder,
        styleConfig: styleConfig || defaultStyle,
      },
    });

    res.status(201).json(resume);
  } catch (error) {
    logger.error({ err: error }, 'Failed to create studio resume');
    res.status(500).json({ error: 'Failed to create resume' });
  }
};

/**
 * GET /studio/resumes/:id
 * Get a single studio resume with full data.
 */
export const getStudioResume = async (req, res) => {
  try {
    const resume = await prisma.studioResume.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: {
        template: {
          select: { name: true, templateData: true, category: true },
        },
      },
    });

    if (!resume) return res.status(404).json({ error: 'Resume not found' });
    res.json(resume);
  } catch (error) {
    logger.error({ err: error }, 'Failed to get studio resume');
    res.status(500).json({ error: 'Failed to fetch resume' });
  }
};

/**
 * PUT /studio/resumes/:id
 * Update a studio resume (autosave endpoint).
 * Implements optimistic concurrency via version check.
 */
export const updateStudioResume = async (req, res) => {
  try {
    const { title, resumeData, sectionOrder, styleConfig, version } = req.body;

    // Optimistic concurrency: only update if version matches
    const existing = await prisma.studioResume.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      select: { version: true },
    });

    if (!existing) return res.status(404).json({ error: 'Resume not found' });

    if (version !== undefined && version !== existing.version) {
      return res.status(409).json({
        error: 'Version conflict',
        message: 'This resume was modified elsewhere. Please refresh and try again.',
        serverVersion: existing.version,
        clientVersion: version,
      });
    }

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (resumeData !== undefined) updateData.resumeData = resumeData;
    if (sectionOrder !== undefined) updateData.sectionOrder = sectionOrder;
    if (styleConfig !== undefined) updateData.styleConfig = styleConfig;
    updateData.version = { increment: 1 };

    const expectedVersion = version !== undefined ? version : existing.version;

    const result = await prisma.studioResume.updateMany({
      where: { 
        id: req.params.id,
        userId: req.user.id,
        version: expectedVersion 
      },
      data: updateData,
    });

    if (result.count === 0) {
      return res.status(409).json({
        error: 'Version conflict',
        message: 'This resume was modified concurrently elsewhere. Please refresh and try again.',
        serverVersion: existing.version,
        clientVersion: version,
      });
    }

    const updated = await prisma.studioResume.findUnique({
      where: { id: req.params.id }
    });

    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'Failed to update studio resume');
    res.status(500).json({ error: 'Failed to update resume' });
  }
};

/**
 * DELETE /studio/resumes/:id
 * Soft delete a studio resume.
 */
export const deleteStudioResume = async (req, res) => {
  try {
    const result = await prisma.studioResume.updateMany({
      where: { id: req.params.id, userId: req.user.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (result.count === 0) return res.status(404).json({ error: 'Resume not found' });
    res.json({ success: true, message: 'Resume moved to trash' });
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete studio resume');
    res.status(500).json({ error: 'Failed to delete resume' });
  }
};

/**
 * POST /studio/resumes/:id/duplicate
 * Duplicate an existing studio resume.
 */
export const duplicateStudioResume = async (req, res) => {
  try {
    const original = await prisma.studioResume.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!original) return res.status(404).json({ error: 'Resume not found' });

    const duplicate = await prisma.studioResume.create({
      data: {
        userId: req.user.id,
        title: `${original.title} (Copy)`,
        templateId: original.templateId,
        resumeData: original.resumeData,
        sectionOrder: original.sectionOrder,
        styleConfig: original.styleConfig,
      },
    });

    res.status(201).json(duplicate);
  } catch (error) {
    logger.error({ err: error }, 'Failed to duplicate studio resume');
    res.status(500).json({ error: 'Failed to duplicate resume' });
  }
};

/**
 * POST /studio/resumes/import/:resumeId
 * Import a parsed resume (from Documents table) into a new studio resume.
 */
export const importFromParsed = async (req, res) => {
  try {
    const { resumeId } = req.params;
    const { templateId } = req.body;

    // Fetch the parsed resume
    const document = await prisma.document.findFirst({
      where: { id: resumeId, userId: req.user.id, type: 'RESUME' },
    });

    if (!document) return res.status(404).json({ error: 'Parsed resume not found' });

    const parsed = document.content || {};

    // Map parsed data to studio schema
    const resumeData = {
      personal: {
        name: parsed.name || '',
        email: parsed.email || '',
        phone: parsed.phone || '',
        linkedin: parsed.linkedin || '',
        location: parsed.location || '',
        website: parsed.website || '',
      },
      summary: parsed.summary || '',
      experience: (parsed.experience || []).map((exp, i) => ({
        id: `exp-${i}`,
        company: exp.company || '',
        role: exp.title || exp.role || '',
        duration: exp.duration || exp.dates || '',
        location: exp.location || '',
        bullets: exp.bullets || exp.responsibilities || [],
      })),
      education: (parsed.education || []).map((edu, i) => ({
        id: `edu-${i}`,
        school: edu.institution || edu.school || '',
        degree: edu.degree || '',
        duration: edu.dates || edu.duration || '',
        gpa: edu.gpa || '',
      })),
      skills: parsed.skills || [],
      projects: (parsed.projects || []).map((proj, i) => ({
        id: `proj-${i}`,
        name: proj.name || '',
        description: proj.description || '',
        technologies: proj.technologies || [],
        url: proj.url || '',
      })),
      certifications: (parsed.certifications || []).map((cert, i) => ({
        id: `cert-${i}`,
        name: cert.name || '',
        issuer: cert.issuer || '',
        date: cert.date || '',
      })),
    };

    // Fetch template defaults if provided
    let styleConfig = {};
    let sectionOrder = ['personal', 'summary', 'experience', 'education', 'skills', 'projects', 'certifications'];

    if (templateId) {
      const template = await prisma.resumeTemplate.findUnique({ where: { id: templateId } });
      if (template?.templateData) {
        styleConfig = template.templateData.style || {};
        sectionOrder = template.templateData.defaultSectionOrder || sectionOrder;
      }
    }

    const resume = await prisma.studioResume.create({
      data: {
        userId: req.user.id,
        title: document.title || 'Imported Resume',
        templateId: templateId || null,
        resumeData,
        sectionOrder,
        styleConfig,
      },
    });

    res.status(201).json(resume);
  } catch (error) {
    logger.error({ err: error }, 'Failed to import resume');
    res.status(500).json({ error: 'Failed to import resume' });
  }
};
