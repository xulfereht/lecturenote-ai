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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

            // 챕터 테이블
            db.run(`CREATE TABLE IF NOT EXISTS chapters (
        id TEXT PRIMARY KEY,
        lecture_id TEXT,
        chapter_number INTEGER,
        title TEXT,
        summary TEXT,
        narrative TEXT,
        threeline_note TEXT,
        detailed_note TEXT,
        quiz TEXT,
        status TEXT DEFAULT 'pending', -- pending, processing, completed, error
        FOREIGN KEY(lecture_id) REFERENCES lectures(id)
      )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
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
