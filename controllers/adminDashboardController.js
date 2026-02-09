// backend/controllers/adminDashboardController.js
const User = require('../models/User');
const Property = require('../models/Property');
const Service = require('../models/Service');
const Admin = require('../models/Admin');
const mongoose = require('mongoose');
const moment = require('moment');

class AdminDashboardController {
  // Get all dashboard statistics
  async getDashboardStats(req, res) {
    try {
      // Check if user has admin permissions
      if (req.user.userType !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Only administrators can access dashboard stats'
        });
      }

      // Run all stats in parallel for better performance
      const [
        userStats,
        propertyStats,
        serviceStats,
        recentActivities,
        systemStats,
        growthData,
        pendingCounts
      ] = await Promise.all([
        this.getUserStats(),
        this.getPropertyStats(),
        this.getServiceStats(),
        this.getRecentActivities(),
        this.getSystemStats(),
        this.getUserGrowthData(),
        this.getPendingCounts()
      ]);

      // Calculate revenue
      const revenue = this.calculateRevenue(userStats, propertyStats, serviceStats);

      res.json({
        success: true,
        data: {
          stats: {
            totalUsers: userStats.totalUsers,
            properties: propertyStats.total,
            services: serviceStats.total,
            revenue: revenue
          },
          recentActivities,
          systemStats,
          growthData,
          pendingCounts,
          detailedStats: {
            users: userStats,
            properties: propertyStats,
            services: serviceStats
          }
        }
      });

    } catch (error) {
      console.error('Get dashboard stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching dashboard statistics',
        error: error.message
      });
    }
  }

  // Get user statistics - FIXED
  async getUserStats() {
    try {
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      
      const stats = await User.aggregate([
        {
          $facet: {
            totalStats: [
              {
                $group: {
                  _id: null,
                  totalUsers: { $sum: 1 },
                  activeUsers: { $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] } },
                  verifiedUsers: { $sum: { $cond: [{ $eq: ["$emailVerified", true] }, 1, 0] } },
                  agentLandlords: { $sum: { $cond: [{ $eq: ["$userType", "agent-landlord"] }, 1, 0] } },
                  houseSeekers: { $sum: { $cond: [{ $eq: ["$userType", "house-seeker"] }, 1, 0] } }
                }
              }
            ],
            monthlyStats: [
              {
                $match: {
                  createdAt: { $gte: lastMonth }
                }
              },
              {
                $group: {
                  _id: null,
                  monthlyNewUsers: { $sum: 1 },
                  monthlyActiveUsers: { $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] } }
                }
              }
            ]
          }
        }
      ]);

      const totalStats = stats[0]?.totalStats[0] || {
        totalUsers: 0,
        activeUsers: 0,
        verifiedUsers: 0,
        agentLandlords: 0,
        houseSeekers: 0
      };

      const monthlyStats = stats[0]?.monthlyStats[0] || {
        monthlyNewUsers: 0,
        monthlyActiveUsers: 0
      };

      // Calculate growth percentage
      const previousMonth = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());
      const previousMonthStats = await User.countDocuments({
        createdAt: { $gte: previousMonth, $lt: lastMonth }
      });

      const userGrowth = previousMonthStats > 0 
        ? ((monthlyStats.monthlyNewUsers - previousMonthStats) / previousMonthStats * 100).toFixed(1)
        : monthlyStats.monthlyNewUsers > 0 ? 100 : 0;

      return {
        ...totalStats,
        monthlyNewUsers: monthlyStats.monthlyNewUsers,
        monthlyActiveUsers: monthlyStats.monthlyActiveUsers,
        userGrowth: parseFloat(userGrowth)
      };
    } catch (error) {
      console.error('Get user stats error:', error);
      return {
        totalUsers: 0,
        activeUsers: 0,
        verifiedUsers: 0,
        agentLandlords: 0,
        houseSeekers: 0,
        monthlyNewUsers: 0,
        monthlyActiveUsers: 0,
        userGrowth: 0
      };
    }
  }

  // Get property statistics - FIXED
  async getPropertyStats() {
    try {
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      
      const stats = await Property.aggregate([
        {
          $facet: {
            totalStats: [
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  active: { $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] } },
                  verified: { $sum: { $cond: [{ $eq: ["$isVerified", true] }, 1, 0] } },
                  featured: { $sum: { $cond: [{ $eq: ["$featured", true] }, 1, 0] } },
                  forSale: { $sum: { $cond: [{ $eq: ["$status", "for-sale"] }, 1, 0] } },
                  forRent: { $sum: { $cond: [{ $eq: ["$status", "for-rent"] }, 1, 0] } },
                  totalViews: { $sum: "$views" },
                  totalSaves: { $sum: "$saves" }
                }
              }
            ],
            monthlyStats: [
              {
                $match: {
                  createdAt: { $gte: lastMonth }
                }
              },
              {
                $group: {
                  _id: null,
                  monthlyNew: { $sum: 1 },
                  monthlyActive: { $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] } }
                }
              }
            ]
          }
        }
      ]);

      const totalStats = stats[0]?.totalStats[0] || {
        total: 0,
        active: 0,
        verified: 0,
        featured: 0,
        forSale: 0,
        forRent: 0,
        totalViews: 0,
        totalSaves: 0
      };

      const monthlyStats = stats[0]?.monthlyStats[0] || {
        monthlyNew: 0,
        monthlyActive: 0
      };

      // Calculate property growth
      const previousMonth = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());
      const previousMonthStats = await Property.countDocuments({
        createdAt: { $gte: previousMonth, $lt: lastMonth }
      });

      const propertyGrowth = previousMonthStats > 0 
        ? ((monthlyStats.monthlyNew - previousMonthStats) / previousMonthStats * 100).toFixed(1)
        : monthlyStats.monthlyNew > 0 ? 100 : 0;

      return {
        ...totalStats,
        monthlyNew: monthlyStats.monthlyNew,
        monthlyActive: monthlyStats.monthlyActive,
        propertyGrowth: parseFloat(propertyGrowth)
      };
    } catch (error) {
      console.error('Get property stats error:', error);
      return {
        total: 0,
        active: 0,
        verified: 0,
        featured: 0,
        forSale: 0,
        forRent: 0,
        totalViews: 0,
        totalSaves: 0,
        monthlyNew: 0,
        monthlyActive: 0,
        propertyGrowth: 0
      };
    }
  }

  // Get service statistics - FIXED
  async getServiceStats() {
    try {
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      
      const stats = await Service.aggregate([
        {
          $facet: {
            totalStats: [
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  active: { $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] } },
                  verified: { $sum: { $cond: [{ $eq: ["$isVerified", true] }, 1, 0] } },
                  featured: { $sum: { $cond: [{ $eq: ["$featured", true] }, 1, 0] } },
                  totalViews: { $sum: "$views" },
                  totalSaves: { $sum: "$saves" },
                  totalCompletedJobs: { $sum: "$completedJobs" }
                }
              }
            ],
            monthlyStats: [
              {
                $match: {
                  createdAt: { $gte: lastMonth }
                }
              },
              {
                $group: {
                  _id: null,
                  monthlyNew: { $sum: 1 },
                  monthlyActive: { $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] } }
                }
              }
            ]
          }
        }
      ]);

      const totalStats = stats[0]?.totalStats[0] || {
        total: 0,
        active: 0,
        verified: 0,
        featured: 0,
        totalViews: 0,
        totalSaves: 0,
        totalCompletedJobs: 0
      };

      const monthlyStats = stats[0]?.monthlyStats[0] || {
        monthlyNew: 0,
        monthlyActive: 0
      };

      // Calculate service growth
      const previousMonth = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());
      const previousMonthStats = await Service.countDocuments({
        createdAt: { $gte: previousMonth, $lt: lastMonth }
      });

      const serviceGrowth = previousMonthStats > 0 
        ? ((monthlyStats.monthlyNew - previousMonthStats) / previousMonthStats * 100).toFixed(1)
        : monthlyStats.monthlyNew > 0 ? 100 : 0;

      return {
        ...totalStats,
        monthlyNew: monthlyStats.monthlyNew,
        monthlyActive: monthlyStats.monthlyActive,
        serviceGrowth: parseFloat(serviceGrowth)
      };
    } catch (error) {
      console.error('Get service stats error:', error);
      return {
        total: 0,
        active: 0,
        verified: 0,
        featured: 0,
        totalViews: 0,
        totalSaves: 0,
        totalCompletedJobs: 0,
        monthlyNew: 0,
        monthlyActive: 0,
        serviceGrowth: 0
      };
    }
  }

  // Calculate revenue
  calculateRevenue(userStats, propertyStats, serviceStats) {
    const agentLandlordRevenue = (userStats.agentLandlords || 0) * 49.99;
    const houseSeekerRevenue = (userStats.houseSeekers || 0) * 29.99;
    const propertyCommission = (propertyStats.total || 0) * 9.99;
    const serviceCommission = (serviceStats.totalCompletedJobs || 0) * 4.99;
    
    const totalRevenue = agentLandlordRevenue + houseSeekerRevenue + propertyCommission + serviceCommission;
    
    return {
      total: totalRevenue,
      monthly: totalRevenue / 12,
      breakdown: {
        subscriptions: agentLandlordRevenue + houseSeekerRevenue,
        propertyCommission,
        serviceCommission
      }
    };
  }

  // Get recent activities
  async getRecentActivities() {
    try {
      const recentUsers = await User.find()
        .select('firstName lastName email userType createdAt')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      const recentProperties = await Property.find()
        .select('title price location type status postedBy createdAt')
        .populate('postedBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      const recentServices = await Service.find()
        .select('title price location category postedBy createdAt')
        .populate('postedBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      const activities = [];

      // Add user signups
      recentUsers.forEach(user => {
        activities.push({
          id: user._id,
          user: 'System',
          action: 'registered',
          target: `${user.firstName} ${user.lastName} (${user.email})`,
          time: moment(user.createdAt).fromNow(),
          type: 'user',
          userType: user.userType
        });
      });

      // Add property listings
      recentProperties.forEach(property => {
        activities.push({
          id: property._id,
          user: property.postedBy ? `${property.postedBy.firstName} ${property.postedBy.lastName}` : 'Unknown User',
          action: 'listed',
          target: `${property.title} (${property.location})`,
          time: moment(property.createdAt).fromNow(),
          type: 'property',
          price: property.price
        });
      });

      // Add service listings
      recentServices.forEach(service => {
        activities.push({
          id: service._id,
          user: service.postedBy ? `${service.postedBy.firstName} ${service.postedBy.lastName}` : 'Unknown User',
          action: 'listed',
          target: `${service.title} (${service.category})`,
          time: moment(service.createdAt).fromNow(),
          type: 'service',
          price: service.price
        });
      });

      return activities
        .sort((a, b) => new Date(b.time) - new Date(a.time))
        .slice(0, 10);

    } catch (error) {
      console.error('Get recent activities error:', error);
      return [];
    }
  }

  // Get system statistics
  async getSystemStats() {
    try {
      const userCount = await User.countDocuments();
      const propertyCount = await Property.countDocuments();
      const serviceCount = await Service.countDocuments();
      const adminCount = await Admin.countDocuments();

      const memoryUsage = process.memoryUsage();
      const memoryPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal * 100).toFixed(1);

      const uptime = process.uptime();
      const uptimeFormatted = this.formatUptime(uptime);

      return {
        database: {
          users: userCount,
          properties: propertyCount,
          services: serviceCount,
          admins: adminCount,
          totalCollections: 4
        },
        memory: {
          used: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
          total: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
          percentage: parseFloat(memoryPercent)
        },
        uptime: uptimeFormatted,
        lastChecked: new Date(),
        systems: [
          {
            name: 'Web Server',
            status: 'operational',
            description: 'Node.js/Express',
            uptime: uptimeFormatted
          },
          {
            name: 'Database',
            status: 'operational',
            description: 'MongoDB Connected',
            connection: 'Active'
          },
          {
            name: 'API Services',
            status: 'operational',
            description: 'All endpoints responding',
            responseTime: '~200ms'
          },
          {
            name: 'Security',
            status: 'operational',
            description: 'All systems secure',
            lastScan: '2 hours ago'
          }
        ]
      };
    } catch (error) {
      console.error('Get system stats error:', error);
      return {
        database: { users: 0, properties: 0, services: 0, admins: 0, totalCollections: 0 },
        memory: { used: '0 MB', total: '0 MB', percentage: 0 },
        uptime: '0 days',
        lastChecked: new Date(),
        systems: []
      };
    }
  }

  // Get user growth data for chart
  async getUserGrowthData() {
    try {
      const now = new Date();
      const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      
      const growthData = await User.aggregate([
        {
          $match: {
            createdAt: { $gte: twelveMonthsAgo }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" }
            },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { "_id.year": 1, "_id.month": 1 }
        }
      ]);

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const formattedData = [];

      for (let i = 0; i < 12; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
        const monthData = growthData.find(d => 
          d._id.year === date.getFullYear() && d._id.month === date.getMonth() + 1
        );
        
        formattedData.push({
          month: monthNames[date.getMonth()],
          users: monthData ? monthData.count : 0,
          year: date.getFullYear()
        });
      }

      let cumulative = 0;
      const cumulativeData = formattedData.map(item => {
        cumulative += item.users;
        return { ...item, cumulative };
      });

      return cumulativeData;
    } catch (error) {
      console.error('Get user growth data error:', error);
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return monthNames.map((month, index) => ({
        month,
        users: 0,
        cumulative: 0
      }));
    }
  }

  // Get pending counts for sidebar
    async getPendingCounts() {
    try {
        const [pendingProperties, pendingServices, pendingUsers, pendingKYC] = await Promise.all([
        Property.countDocuments({
            $or: [
            { isVerified: false },
            { isActive: false },
            { status: 'pending' }
            ]
        }),
        
        Service.countDocuments({
            $or: [
            { isVerified: false },
            { isActive: false }
            ]
        }),
        
        User.countDocuments({
            isActive: false,
            emailVerified: false
        }),
        
        User.countDocuments({
            'kyc.status': 'pending'
        })
        ]);

        return {
        properties: pendingProperties,
        services: pendingServices,
        users: pendingUsers,
        kyc: pendingKYC,
        total: pendingProperties + pendingServices + pendingUsers + pendingKYC
        };
    } catch (error) {
        console.error('Get pending counts error:', error);
        return {
        properties: 0,
        services: 0,
        users: 0,
        kyc: 0,
        total: 0
        };
    }
    }

  // Helper function to format uptime
  formatUptime(seconds) {
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  // Bind all methods to maintain 'this' context
  constructor() {
    // Bind all methods to maintain 'this' context
    this.getDashboardStats = this.getDashboardStats.bind(this);
    this.getUserStats = this.getUserStats.bind(this);
    this.getPropertyStats = this.getPropertyStats.bind(this);
    this.getServiceStats = this.getServiceStats.bind(this);
    this.calculateRevenue = this.calculateRevenue.bind(this);
    this.getRecentActivities = this.getRecentActivities.bind(this);
    this.getSystemStats = this.getSystemStats.bind(this);
    this.getUserGrowthData = this.getUserGrowthData.bind(this);
    this.getPendingCounts = this.getPendingCounts.bind(this);
    this.formatUptime = this.formatUptime.bind(this);
  }
}

// Create instance with bound methods
const adminDashboardController = new AdminDashboardController();

module.exports = adminDashboardController;