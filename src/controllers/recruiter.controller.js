import prisma from '../config/db.js';
import logger from '../config/logger.js';

export const createCompany = async (req, res) => {
  try {
    const { name, description, website, logoUrl } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    const company = await prisma.company.create({
      data: {
        userId: req.user.id,
        name,
        description,
        website,
        logoUrl
      }
    });

    res.status(201).json(company);
  } catch (error) {
    logger.error({ err: error }, 'Failed to create company');
    res.status(500).json({ error: 'Failed to create company' });
  }
};

export const createJobPosting = async (req, res) => {
  try {
    const { companyId, title, description, location, type, salaryRange } = req.body;

    if (!title || !description || !companyId) {
      return res.status(400).json({ error: 'Company ID, title, and description are required' });
    }

    // Verify company belongs to user
    const company = await prisma.company.findUnique({
      where: { id: companyId, userId: req.user.id }
    });

    if (!company) {
      return res.status(403).json({ error: 'Unauthorized to post jobs for this company' });
    }

    const job = await prisma.jobPosting.create({
      data: {
        companyId,
        title,
        description,
        location,
        type,
        salaryRange
      }
    });

    res.status(201).json(job);
  } catch (error) {
    logger.error({ err: error }, 'Failed to create job posting');
    res.status(500).json({ error: 'Failed to create job posting' });
  }
};

export const getRecruiterDashboard = async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      where: { userId: req.user.id },
      include: {
        jobPostings: {
          include: {
            _count: { select: { matches: true } }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    res.json(companies);
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch recruiter dashboard data');
    res.status(500).json({ error: 'Failed to fetch recruiter dashboard data' });
  }
};

export const getJobMatches = async (req, res) => {
  try {
    const { jobId } = req.params;

    // Verify ownership
    const job = await prisma.jobPosting.findUnique({
      where: { id: jobId },
      include: { company: true }
    });

    if (!job || job.company.userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const matches = await prisma.candidateMatch.findMany({
      where: { jobId },
      orderBy: { matchScore: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } }
      }
    });

    res.json(matches);
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch job matches');
    res.status(500).json({ error: 'Failed to fetch job matches' });
  }
};
