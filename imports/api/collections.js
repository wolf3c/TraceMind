import { Mongo } from 'meteor/mongo';

export const Developers = new Mongo.Collection('tracemind_developers');
export const Projects = new Mongo.Collection('tracemind_projects');
export const RawBehaviors = new Mongo.Collection('tracemind_raw_behaviors');
export const SemanticEvents = new Mongo.Collection('tracemind_semantic_events');
export const PresenceSessions = new Mongo.Collection('tracemind_presence_sessions');
export const CaptureDeliveryReports = new Mongo.Collection('tracemind_capture_delivery_reports');
export const FeedbackReports = new Mongo.Collection('tracemind_feedback_reports');
export const UserFeedbackReports = new Mongo.Collection('tracemind_user_feedback_reports');
export const ProjectDailyReports = new Mongo.Collection('tracemind_project_daily_reports');
export const ProjectHourlyReports = new Mongo.Collection('tracemind_project_hourly_reports');
export const ProductUsageMarkers = new Mongo.Collection('tracemind_product_usage_markers');
export const SetupAttempts = new Mongo.Collection('tracemind_setup_attempts');
