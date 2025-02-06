-- CreateTable
CREATE TABLE `User` (
    `user_id` VARCHAR(255) NOT NULL,
    `user_avatar` VARCHAR(255) NULL,
    `user_name` VARCHAR(255) NULL,
    `comment_list` TEXT NULL,
    `collected_article_list` TEXT NULL,
    `published_article_list` TEXT NULL,

    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
