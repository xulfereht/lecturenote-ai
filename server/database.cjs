const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'lecture_notes.db');
const db = new sqlite3.Database(dbPath);

// DB 초기화 및 테이블 생성
function initDB() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // 강의 테이블
            db.run(`CREATE TABLE IF NOT EXISTS lectures (
        id TEXT PRIMARY KEY,
        title TEXT,
        raw_text TEXT,
        original_text TEXT,
        correction_stats TEXT,
        author TEXT,
        source_url TEXT,
        tags TEXT, -- JSON string array
        memo TEXT,
        final_summary TEXT, -- JSON string
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

            // 챕터 테이블
            db.run(`CREATE TABLE IF NOT EXISTS chapters (
        id TEXT PRIMARY KEY,
        lecture_id TEXT,
        chapter_number INTEGER,
        title TEXT,
        start_time TEXT,
        end_time TEXT,
        summary TEXT,
        narrative TEXT,
        threeline_note TEXT,
        detailed_note TEXT,
        quiz TEXT,
        status TEXT DEFAULT 'pending', -- pending, processing, completed, error
        FOREIGN KEY(lecture_id) REFERENCES lectures(id)
      )`);

            // 마이그레이션: 기존 테이블에 컬럼 추가
            const columnsToAdd = ['original_text', 'correction_stats', 'author', 'source_url', 'tags', 'memo', 'final_summary', 'overview'];
            columnsToAdd.forEach(col => {
                db.run(`ALTER TABLE lectures ADD COLUMN ${col} TEXT`, (err) => { /* ignore */ });
            });

            // 챕터 테이블 마이그레이션
            const chapColumnsToAdd = ['start_time', 'end_time'];
            chapColumnsToAdd.forEach(col => {
                db.run(`ALTER TABLE chapters ADD COLUMN ${col} TEXT`, (err) => { /* ignore */ });
            });

            // 서버 재시작 시 processing 상태로 멈춘 챕터들을 pending으로 복구
            db.run(`UPDATE chapters SET status = 'pending' WHERE status = 'processing'`, function(err) {
                if (!err && this.changes > 0) {
                    console.log(`[Recovery] ${this.changes} stuck chapter(s) reset to pending`);
                }
            });

            resolve();
        });
    });
}

// Helper methods (Promise wrapper)
const run = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

const get = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const all = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

module.exports = {
    db,
    initDB,
    run,
    get,
    all
};
