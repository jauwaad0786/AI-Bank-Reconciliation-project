const cluster = require('cluster');
const os = require('os');
const compression = require('compression');

// ✅ Import Sequelize model
const { SystemPerformanceLog } = require('../models'); 

// Database connection pooling for performance
const sequelizeConfig = {
  host: process.env.DB_HOST,
  dialect: 'mysql',
  pool: {
    max: 20,        // Maximum connections in pool
    min: 0,         // Minimum connections in pool  
    acquire: 30000, // Maximum time to get connection
    idle: 10000,    // Maximum time connection can be idle
  },
  // Performance optimizations
  logging: process.env.NODE_ENV === 'production' ? false : console.log,
  benchmark: true,
  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: true,
  },
  // Query timeout for performance
  dialectOptions: {
    acquireTimeout: 60000,
    timeout: 60000,
  }
};

// Cluster setup for concurrent users
const setupCluster = () => {
  const numCPUs = os.cpus().length;
  
  if (cluster.isMaster) {
    console.log(`Master ${process.pid} is running`);
    console.log(`Starting ${numCPUs} workers for performance...`);
    
    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
      cluster.fork();
    }
    
    // Replace dead workers
    cluster.on('exit', (worker, code, signal) => {
      console.log(`Worker ${worker.process.pid} died. Restarting...`);
      cluster.fork();
    });
    
    return false; // Don't start Express in master
  }
  
  return true; // Start Express in worker
};

// Performance monitoring
const performanceMonitor = {
  // Track API response times
  responseTime: (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', async () => {
      const duration = Date.now() - start;
      
      // Log slow queries (>1 second)
      if (duration > 1000) {
        console.warn(`Slow API: ${req.method} ${req.path} took ${duration}ms`);
        
        // ✅ Store in performance log table
        try {
          await SystemPerformanceLog.create({
            operationType: `API_${req.method}_${req.path}`,
            durationMs: duration,
            status: res.statusCode >= 400 ? 'error' : 'success',
            operationDetails: {
              method: req.method,
              path: req.path,
              user_id: req.user?.id || null,
              query_params: req.query,
              response_code: res.statusCode
            }
          });
        } catch (error) {
          console.error('❌ Failed to log performance:', error.message);
        }
      }
    });
    
    next();
  },

  // Memory usage monitoring
  memoryMonitor: setInterval(() => {
    const used = process.memoryUsage();
    const memoryMB = {
      rss: Math.round(used.rss / 1024 / 1024 * 100) / 100,
      heapTotal: Math.round(used.heapTotal / 1024 / 1024 * 100) / 100,
      heapUsed: Math.round(used.heapUsed / 1024 / 1024 * 100) / 100,
      external: Math.round(used.external / 1024 / 1024 * 100) / 100
    };
    
    // Alert if memory usage is high
    if (memoryMB.heapUsed > 500) { // 500MB threshold
      console.warn('⚠️ High memory usage:', memoryMB);
    }
  }, 30000), // Check every 30 seconds
};

module.exports = { 
  performanceMonitor,  
  setupCluster,
  sequelizeConfig
};
