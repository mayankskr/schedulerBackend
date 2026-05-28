// src/services/socialAccountService.js
import { SocialAccount, User } from '../models/index.js';

export const listAccountsService = async (userId) => {
  const user = await User.findByPk(userId);

  const accounts = await SocialAccount.findAll({
    where:      { team_id: user.team_id, is_active: true },
    attributes: ['id', 'platform', 'label', 'account_id'],
    order:      [['platform', 'ASC'], ['label', 'ASC']],
  });

  // Group by platform for the frontend selector
  return accounts.reduce((acc, a) => {
    (acc[a.platform] ??= []).push(a);
    return acc;
  }, {});
  // Returns: { ig: [{id, label}, ...×30], fb: [{id, label}, ...×15], yt: [...] }
};

export const connectAccountService = async (userId, { platform, label, access_token, refresh_token, account_id }) => {
  const user = await User.findByPk(userId);
  if (user.role !== 'admin') throw new AppError('Only admins can connect accounts', 403);

  return SocialAccount.create({
    team_id: user.team_id,
    platform, label, access_token, refresh_token, account_id,
  });
};