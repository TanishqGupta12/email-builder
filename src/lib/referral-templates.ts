export type ReferralChannel = "linkedin" | "email";
export type ReferralAudience = "fresher" | "experienced";

export type ReferralTemplate = {
  id: string;
  channel: ReferralChannel;
  audience: ReferralAudience;
  variant: 1 | 2;
  title: string;
  hint: string;
  /** `null` for LinkedIn — composer fills a short generic subject */
  subject: string | null;
  body: string;
};

/** Cold DM (LinkedIn) + cold email templates for referral outreach. */
export const REFERRAL_TEMPLATES: ReferralTemplate[] = [
  // —— LinkedIn — Freshers
  {
    id: "li-f1",
    channel: "linkedin",
    audience: "fresher",
    variant: 1,
    title: "Short & direct",
    hint: "Recent grad, ask for guidance + referral",
    subject: null,
    body: `Hi [Name],

I hope you're doing well. I came across your profile and saw that you're working as a [Role] at [Company].

I'm a recent graduate currently learning [DevOps/Cloud/Data Science/etc] and building projects on [mention tools briefly]. I'm very interested in applying for [Job Role] at your company.

If possible, could you please guide me on how I can best position myself for this role? And if you feel I'm a good fit, I would be grateful for a referral.

Thank you for your time

Best regards,
[Your Name]`,
  },
  {
    id: "li-f2",
    channel: "linkedin",
    audience: "fresher",
    variant: 2,
    title: "Value-based",
    hint: "Company research + project bullets",
    subject: null,
    body: `Hi [Name],

I've been following [Company Name] and was impressed by [mention something specific – tech stack, recent funding, product launch].

I'm a fresher focused on [DevOps/Cloud/etc], and I've recently completed projects on:
• Docker + Kubernetes deployment
• CI/CD using GitHub Actions
• AWS infrastructure setup

I saw an opening for [Job Role] and wanted to check if you'd be open to referring me. I'd be happy to share my resume and GitHub.

Thanks a lot for your time!`,
  },
  // —— LinkedIn — Experienced
  {
    id: "li-e1",
    channel: "linkedin",
    audience: "experienced",
    variant: 1,
    title: "Professional & concise",
    hint: "Experience + role match",
    subject: null,
    body: `Hi [Name],

I noticed you're working as [Role] at [Company]. I'm currently working as a [Your Role] with X years of experience in DevOps/Cloud specializing in [Kubernetes, Terraform, CI/CD, etc].

I found an open position for [Job Role] at your company and believe my experience aligns well.

Would you be comfortable referring me for this role? I'd truly appreciate your support.

Thank you in advance!`,
  },
  {
    id: "li-e2",
    channel: "linkedin",
    audience: "experienced",
    variant: 2,
    title: "Networking first",
    hint: "Connect, then referral",
    subject: null,
    body: `Hi [Name],

I hope you're doing well. I'm currently a [Your Role] with X years experience, working mainly on [mention stack briefly].

I'm exploring opportunities at [Company Name] because of its strong engineering culture and product focus.

I'd love to connect and understand your experience there. Also, if there's a suitable opening, I'd be grateful for a referral.

Thanks for your time!`,
  },
  // —— Email — Freshers
  {
    id: "em-f1",
    channel: "email",
    audience: "fresher",
    variant: 1,
    title: "Referral-specific",
    hint: "Subject + projects + resume",
    subject: "Request for Referral – [Job Role] at [Company Name]",
    body: `Dear [Name],

My name is [Your Name], and I recently graduated in [Degree]. I came across your profile while researching professionals at [Company Name].

I'm highly interested in the [Job Role] position (Job ID: if available). I have built projects using:
• AWS (EC2, S3, IAM)
• Docker & Kubernetes
• CI/CD with Jenkins/GitHub Actions

I would be grateful if you could consider referring me for this position. I've attached my resume for your reference.

Thank you for your time and consideration.

Best regards,
[Your Name]
[LinkedIn]
[GitHub]`,
  },
  {
    id: "em-f2",
    channel: "email",
    audience: "fresher",
    variant: 2,
    title: "Guidance + referral",
    hint: "Aspiring DevOps angle",
    subject: "Seeking Guidance – Aspiring DevOps Engineer",
    body: `Dear [Name],

I hope you're doing well. I am an aspiring DevOps Engineer actively building hands-on projects in cloud and automation.

I came across an opening for [Role] at [Company Name], and it aligns well with my skills. I would really appreciate your guidance on whether my profile fits the requirement, and if possible, a referral.

Thank you for your valuable time.

Kind regards,
[Your Name]`,
  },
  // —— Email — Experienced
  {
    id: "em-e1",
    channel: "email",
    audience: "experienced",
    variant: 1,
    title: "Direct referral",
    hint: "Experience bullets + resume",
    subject: "Referral Request – [Job Role] | X Years DevOps Experience",
    body: `Dear [Name],

I hope this message finds you well.

I am currently working as a [Your Role] with X years of experience in:
• Kubernetes & Containerization
• Terraform & Infrastructure as Code
• CI/CD Automation
• AWS/Azure

I recently found an opening for [Job Role] at [Company Name] and believe my background aligns strongly.

I would truly appreciate your referral for this role. Please find my resume attached.

Thank you for your support.

Best regards,
[Your Name]`,
  },
  {
    id: "em-e2",
    channel: "email",
    audience: "experienced",
    variant: 2,
    title: "Open opportunities",
    hint: "Exploring + culture fit",
    subject: "Exploring Opportunities at [Company Name]",
    body: `Dear [Name],

I hope you're doing well. I'm currently exploring new opportunities in DevOps/Cloud engineering and am particularly interested in [Company Name] due to its strong product ecosystem and engineering standards.

With X years of experience in automation, CI/CD, and cloud infrastructure, I would love to contribute to your team.

If there are any suitable openings or if you'd be open to referring me, I would greatly appreciate your support.

Thank you for your time.

Warm regards,
[Your Name]`,
  },
];

export function templatesFor(
  channel: ReferralChannel,
  audience: ReferralAudience,
): ReferralTemplate[] {
  return REFERRAL_TEMPLATES.filter(
    (t) => t.channel === channel && t.audience === audience,
  );
}
