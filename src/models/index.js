import sequelize from "../config/db.js";
import User from "./userModel.js";
import Team from "./teamModel.js";
import Post from "./postModel.js";
import ScheduleSlot from "./scheduleSlotModel.js";
import SocialAccount from './socialAccountModel.js';
import PostPlatform from "./postPlatform.js";

Team.hasMany(SocialAccount, { foreignKey: 'team_id' });
SocialAccount.belongsTo(Team, { foreignKey: 'team_id' });

PostPlatform.belongsTo(SocialAccount, { foreignKey: 'social_account_id' });
SocialAccount.hasMany(PostPlatform, { foreignKey: 'social_account_id' });

// Team <-> User
Team.hasMany(User, { foreignKey: "team_id" });
User.belongsTo(Team, { foreignKey: "team_id" });

// User <-> Post
User.hasMany(Post, { foreignKey: "user_id" });
Post.belongsTo(User, { foreignKey: "user_id" });

// Post <-> PostPlatforms
Post.hasMany(PostPlatform, { foreignKey: "post_id" });
PostPlatform.belongsTo(Post, { foreignKey: "post_id" });

// Post <-> ScheduleSlot
Post.hasOne(ScheduleSlot, { foreignKey: "post_id" });
ScheduleSlot.belongsTo(Post, { foreignKey: "post_id" });

export { sequelize, User, Team, Post, ScheduleSlot, PostPlatform, SocialAccount };
//                                                               ↑ add this