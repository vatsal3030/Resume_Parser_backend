import prisma from '../config/db.js';
import logger from '../config/logger.js';

export const onboardUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const { field, targetRole, experienceLevel, graduationYear, skills, salaryExpectation } = req.body;

    // Ensure User exists
    let user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          id: userId,
          email: req.user.email || 'unknown@example.com',
        }
      });
    }

    // Upsert Profile
    const parsedGradYear = graduationYear ? parseInt(graduationYear) : null;
    const profile = await prisma.profile.upsert({
      where: { userId },
      update: { field, targetRole, experienceLevel, graduationYear: parsedGradYear, skills, salaryExpectation },
      create: {
        userId, field, targetRole, experienceLevel, graduationYear: parsedGradYear, skills, salaryExpectation
      }
    });

    res.status(200).json({ message: 'Profile updated successfully', profile });
  } catch (err) {
    logger.error({ err }, 'Onboarding Error');
    res.status(500).json({ error: 'Failed to onboard user' });
  }
};

export const getUserDetails = async (req, res) => {
  try {
    let user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { profile: true }
    });
    
    if (!user) {
      // Auto-create user if they exist in Supabase but not in Prisma
      try {
        user = await prisma.user.create({
          data: {
            id: req.user.id,
            email: req.user.email || 'unknown@example.com',
            credits: 500,
            profile: {
              create: { creditBalance: 500 }
            }
          },
          include: { profile: true }
        });
      } catch (createErr) {
        logger.warn({ err: createErr?.message, userId: req.user.id }, 'User create failed, attempting find again');
        user = await prisma.user.findUnique({
          where: { id: req.user.id },
          include: { profile: true }
        });
      }
    }

    const creditBalance = user?.profile?.creditBalance ?? user?.credits ?? 500;
    
    res.json({
      id: req.user.id,
      email: req.user.email,
      ...user,
      creditBalance,
      credits: creditBalance,
      profile: {
        ...(user?.profile || {}),
        creditBalance
      }
    });
  } catch (err) {
    logger.error({ err: err?.message, userId: req.user?.id }, 'Failed to fetch user details (returning graceful fallback)');
    res.json({
      id: req.user.id,
      email: req.user.email || 'unknown@example.com',
      tier: 'FREE',
      credits: 500,
      creditBalance: 500,
      profile: {
        creditBalance: 500,
        avatarUrl: null
      }
    });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 1. Ensure User exists
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: req.user.email || 'unknown@example.com'
      }
    });

    // 2. Extract ONLY valid scalar fields from Profile model to avoid Prisma unknown field / relation errors
    const { 
      username, phone, country, city, bio,
      targetRole, experienceLevel, field, salaryExpectation, skills,
      school, branch, passingYear, graduationYear,
      socialLinks, projectLinks, certificates, achievements,
      codingExperience, preferredLanguages, careerGoals,
      avatarUrl
    } = req.body;

    const profileData = {};
    if (username !== undefined) profileData.username = username || null;
    if (phone !== undefined) profileData.phone = phone || null;
    if (country !== undefined) profileData.country = country || null;
    if (city !== undefined) profileData.city = city || null;
    if (bio !== undefined) profileData.bio = bio || null;
    if (targetRole !== undefined) profileData.targetRole = targetRole || null;
    if (experienceLevel !== undefined) profileData.experienceLevel = experienceLevel || null;
    if (field !== undefined) profileData.field = field || null;
    if (salaryExpectation !== undefined) profileData.salaryExpectation = salaryExpectation || null;
    if (skills !== undefined) profileData.skills = Array.isArray(skills) ? skills : [];
    if (school !== undefined) profileData.school = school || null;
    if (branch !== undefined) profileData.branch = branch || null;
    if (passingYear !== undefined) profileData.passingYear = passingYear || null;
    if (graduationYear !== undefined) profileData.graduationYear = graduationYear ? parseInt(graduationYear, 10) : null;
    if (socialLinks !== undefined) profileData.socialLinks = socialLinks || {};
    if (projectLinks !== undefined) profileData.projectLinks = projectLinks || [];
    if (certificates !== undefined) profileData.certificates = certificates || [];
    if (achievements !== undefined) profileData.achievements = Array.isArray(achievements) ? achievements : [];
    if (codingExperience !== undefined) profileData.codingExperience = codingExperience || null;
    if (preferredLanguages !== undefined) profileData.preferredLanguages = Array.isArray(preferredLanguages) ? preferredLanguages : [];
    if (careerGoals !== undefined) profileData.careerGoals = careerGoals || null;
    if (avatarUrl !== undefined) profileData.avatarUrl = avatarUrl || null;

    const profile = await prisma.profile.upsert({
      where: { userId },
      update: profileData,
      create: {
        userId,
        ...profileData
      }
    });

    res.status(200).json({ message: 'Profile updated successfully', profile });
  } catch (err) {
    logger.error({ err: err.message, userId: req.user?.id }, 'Update Profile Error');
    res.status(500).json({ error: 'Failed to update profile', details: err.message });
  }
};
