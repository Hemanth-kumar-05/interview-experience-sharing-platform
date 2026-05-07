const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  googleId: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  name: {
    type: String,
    required: true
  },
  avatar: {
    type: String,
    default: null
  },
  role: {
    type: String,
    enum: ['Student', 'Admin', 'Moderator', 'SuperAdmin'],
    default: 'Student'
  },
  university: {
    type: String,
    default: "PSG College of Technology"
  },
  graduationYear: {
    type: Number,
    min: 2020,
    max: 2030
  },
  // Background Information
  backgroundData: {
    branch: {
      type: String,
      enum: [
        "B. E.",
        "B. Tech.",
        "B. Sc.",
        "Other"
      ],
      default: null
    },
    department: {
      type: String,
      enum: [
        "Automobile Engineering",
        "Biomedical Engineering",
        "Civil Engineering",
        "Computer Science and Engineering",
        "Computer Science and Engineering (AI and ML)",
        "Electrical and Electronics Engineering",
        "Electronics and Communication Engineering",
        "Instrumentation and Control Engineering",
        "Mechanical Engineering",
        "Metallurgical Engineering",
        "Production Engineering",
        "Robotics and Automation",
        "Bio Technology",
        "Fashion Technology",
        "Information Technology",
        "Textile Technology",
        "Electrical and Electronics Engineering (Sandwich)",
        "Mechanical Engineering (Sandwich)",
        "Production Engineering (Sandwich)",
        "Applied Science",
        "Computer Systems and Design"
      ],
      default: null
    },
    cgpa: {
      type: Number,
      min: 0,
      max: 10,
      default: null
    },
    previousInternships: {
      type: Number,
      min: 0,
      default: 0
    },
    relevantProjects: [{
      type: String
    }],
    skills: [{
      type: String
    }],
    yearOfStudy: {
      type: String,
      enum: ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Graduate', 'Postgraduate'],
      default: null
    }
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  bookmarks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Experience'
  }],
  // Gamification
  points: {
    type: Number,
    default: 0
  },
  badges: [{
    type: String,
    enum: ['Contributor', 'Helper', 'Expert', 'Mentor', 'Top Reviewer']
  }],
  level: {
    type: Number,
    default: 1
  },
  streak: {
    type: Number,
    default: 0
  },
  // Preferences
  preferences: {
    notifications: {
      email: { type: Boolean, default: true },
      browser: { type: Boolean, default: true }
    },
    privacy: {
      showEmail: { type: Boolean, default: false },
      showUniversity: { type: Boolean, default: true }
    }
  },
  // Stats
  stats: {
    experiencesShared: { type: Number, default: 0 },
    totalViews: { type: Number, default: 0 },
    totalUpvotes: { type: Number, default: 0 },
    helpfulnessScore: { type: Number, default: 0 }
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  // Track seen announcements/news by notification _id
  announcementsSeen: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Notification'
  }]
}, {
  timestamps: true
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ googleId: 1 });
userSchema.index({ university: 1 });

// Methods
userSchema.methods.updateStats = function(field, increment = 1) {
  this.stats[field] = (this.stats[field] || 0) + increment;
  return this.save();
};

userSchema.methods.addBadge = function(badge) {
  if (!this.badges.includes(badge)) {
    this.badges.push(badge);
    return this.save();
  }
  return Promise.resolve(this);
};

module.exports = mongoose.model('User', userSchema);
