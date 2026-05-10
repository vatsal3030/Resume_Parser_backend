import prisma from '../config/db.js';
import logger from '../config/logger.js';

export const getApplications = async (req, res) => {
  try {
    const applications = await prisma.jobApplication.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });
    res.json(applications);
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch job applications');
    res.status(500).json({ error: 'Failed to fetch job applications' });
  }
};

export const createApplication = async (req, res) => {
  try {
    const { company, role, url, salary, status, notes } = req.body;

    if (!company || !role) {
      return res.status(400).json({ error: 'Company and Role are required' });
    }

    const application = await prisma.jobApplication.create({
      data: {
        userId: req.user.id,
        company,
        role,
        url,
        salary,
        status: status || 'SAVED',
        notes
      }
    });

    res.status(201).json(application);
  } catch (error) {
    logger.error({ err: error }, 'Failed to create job application');
    res.status(500).json({ error: 'Failed to create job application' });
  }
};

export const updateApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const { company, role, url, salary, status, notes } = req.body;

    const existing = await prisma.jobApplication.findUnique({
      where: { id, userId: req.user.id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const updated = await prisma.jobApplication.update({
      where: { id },
      data: { company, role, url, salary, status, notes }
    });

    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'Failed to update job application');
    res.status(500).json({ error: 'Failed to update job application' });
  }
};

export const deleteApplication = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.jobApplication.findUnique({
      where: { id, userId: req.user.id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Application not found' });
    }

    await prisma.jobApplication.delete({ where: { id } });

    res.json({ message: 'Application deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete job application');
    res.status(500).json({ error: 'Failed to delete job application' });
  }
};
