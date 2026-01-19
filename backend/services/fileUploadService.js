// backend/services/fileUploadService.js
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const ReconciliationService = require('./reconciliationService');

class FileUploadService {
    constructor() {
        this.uploadPath = path.join(__dirname, '../uploads');
        this.tempPath = path.join(__dirname, '../temp');
        this.reconciliationService = new ReconciliationService();

        // Supported file types
        this.supportedTypes = {
            'text/csv': 'csv',
            'application/vnd.ms-excel': 'xls',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
            'application/pdf': 'pdf'
        };

        // Maximum file size (50MB)
        this.maxFileSize = 50 * 1024 * 1024;

        this.initializeDirectories();
        this.setupMulter();
    }

    async initializeDirectories() {
        try {
            await fs.mkdir(this.uploadPath, { recursive: true });
            await fs.mkdir(this.tempPath, { recursive: true });
        } catch (error) {
            console.error('Error creating directories:', error);
        }
    }

    setupMulter() {
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, this.uploadPath);
            },
            filename: (req, file, cb) => {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
                const ext = path.extname(file.originalname);
                cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
            }
        });

        const fileFilter = (req, file, cb) => {
            if (this.supportedTypes[file.mimetype]) {
                cb(null, true);
            } else {
                cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
            }
        };

        this.upload = multer({
            storage: storage,
            limits: {
                fileSize: this.maxFileSize,
                files: 10
            },
            fileFilter: fileFilter
        });
    }

    getSingleUploadMiddleware(fieldName = 'file') {
        return this.upload.single(fieldName);
    }

    getMultipleUploadMiddleware(fieldName = 'files', maxCount = 2) {
        return this.upload.array(fieldName, maxCount);
    }

    getFieldsUploadMiddleware() {
        return this.upload.fields([
            { name: 'bankStatement', maxCount: 1 },
            { name: 'bookLedger', maxCount: 1 }
        ]);
    }

    async processUploadedFile(file, options = {}) {
        try {
            const {
                bankName = null,
                columnMapping = null,
                fileType = 'bank_statement'
            } = options;

            const validation = this.validateFile(file);
            if (!validation.valid) {
                throw new Error(validation.error);
            }

            const fileBuffer = await fs.readFile(file.path);

            const result = await this.reconciliationService.processFile(
                fileBuffer,
                file.originalname,
                this.supportedTypes[file.mimetype],
                columnMapping,
                bankName
            );

            await fs.unlink(file.path).catch(console.error);

            return {
                success: true,
                fileInfo: {
                    originalName: file.originalname,
                    size: file.size,
                    type: file.mimetype,
                    processedAt: new Date().toISOString()
                },
                processingResults: result
            };

        } catch (error) {
            if (file && file.path) {
                await fs.unlink(file.path).catch(console.error);
            }
            throw new Error(`File processing failed: ${error.message}`);
        }
    }

    async processMultipleFiles(files, options = {}) {
        try {
            const results = {};
            const errors = [];

            for (const [fieldName, fileArray] of Object.entries(files)) {
                if (fileArray && fileArray.length > 0) {
                    const file = fileArray[0];
                    try {
                        const fileOptions = { ...options, fileType: fieldName };
                        const result = await this.processUploadedFile(file, fileOptions);
                        results[fieldName] = result;
                    } catch (error) {
                        errors.push({
                            fieldName,
                            fileName: file.originalname,
                            error: error.message
                        });
                    }
                }
            }

            return {
                success: errors.length === 0,
                results,
                errors,
                summary: {
                    filesProcessed: Object.keys(results).length,
                    errorsCount: errors.length
                }
            };

        } catch (error) {
            throw new Error(`Multiple file processing failed: ${error.message}`);
        }
    }

    async detectColumnMappings(file, bankName = null) {
        try {
            const fileBuffer = await fs.readFile(file.path);

            const result = await this.reconciliationService.processFile(
                fileBuffer,
                file.originalname,
                this.supportedTypes[file.mimetype],
                null,
                bankName
            );

            await fs.unlink(file.path).catch(console.error);

            return {
                success: true,
                detectedMapping: result.columnMapping,
                columnTypes: result.columnTypes,
                sampleData: result.transactions.slice(0, 5),
                fileInfo: result.fileInfo
            };

        } catch (error) {
            if (file && file.path) {
                await fs.unlink(file.path).catch(console.error);
            }
            throw new Error(`Column mapping detection failed: ${error.message}`);
        }
    }

    validateFile(file) {
        if (!file) {
            return { valid: false, error: 'No file uploaded' };
        }
        if (!this.supportedTypes[file.mimetype]) {
            return { valid: false, error: `Unsupported file type: ${file.mimetype}` };
        }
        if (file.size > this.maxFileSize) {
            return { valid: false, error: 'File size exceeds maximum limit' };
        }
        return { valid: true };
    }
}

module.exports = FileUploadService;
