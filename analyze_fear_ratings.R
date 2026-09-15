# 恐惧图片评分：描述统计和绘图（仅使用 R 自带包）
# RStudio: 打开本文件，点击 Source。若找不到 CSV，会弹窗选择文件。
# 原始 CSV 不会被修改。输出位于 CSV 同目录的 fear_analysis 文件夹。
# 方法：先将重复的 subject_id + image 评分平均，再计算被试/图片均值。
# 这将同编号视为同一个人；多会话可能涉及重测，请核对 session_audit.csv。
# 正式分析前应预先确定重测处理规则和未完成被试纳入标准。
input_file <- "fear_ratings.csv"
if (!file.exists(input_file)) input_file <- file.choose()
input_file <- normalizePath(input_file, winslash = "/", mustWork = TRUE)
out_dir <- file.path(dirname(input_file), "fear_analysis")
dir.create(out_dir, showWarnings = FALSE)
# 如要排除测试编号，在这里填写，例如 c("test", "001")。
exclude_subjects <- c("侯通业", "李萌萌")
# 若研究设计并非125张，请按实际设计修改；不从当前缺失记录猜测总数。
expected_images <- 125L

raw <- read.csv(input_file, fileEncoding = "UTF-8-BOM", colClasses = "character",
                check.names = FALSE, na.strings = c("", "NA"))
required <- c("subject_id", "session_id", "image", "fear_rating_0_100")
if (!all(required %in% names(raw))) stop("缺少必要字段：", paste(setdiff(required, names(raw)), collapse=", "))
raw$rating <- suppressWarnings(as.numeric(raw$fear_rating_0_100))
# 0 是有效评分；缺失分数不按0填补，也不将旧0-100评分自动缩放。
bad <- is.na(raw$subject_id) | is.na(raw$image) | is.na(raw$session_id) |
  !is.finite(raw$rating) | raw$rating < 0 | raw$rating > 9 | raw$rating %% 1 != 0
save_csv <- function(x, name) write.csv(x, file.path(out_dir, name), row.names=FALSE,
                                      fileEncoding="UTF-8", na="")
if (any(bad)) {
  save_csv(raw[bad, ], "invalid_rows.csv")
  stop("存在编号/图片/会话缺失或非0-9整数评分，详见 invalid_rows.csv；请核查后重跑。")
}
d <- raw[!raw$subject_id %in% exclude_subjects, ]
if (!nrow(d)) stop("没有可分析的评分。")
# 多会话审计，保留每个会话的记录数，不自动将会话当作不同的人。
audit <- aggregate(d$rating, d[c("subject_id", "session_id")], length)
names(audit)[3] <- "n_rows"
save_csv(audit, "session_audit.csv")
pair_counts <- aggregate(d$rating, d[c("subject_id", "image")], length)
names(pair_counts)[3] <- "n_ratings"
save_csv(pair_counts[pair_counts$n_ratings > 1, ], "duplicate_subject_image.csv")
# 每个被试对每个图片恰好一个值；重复评分的默认处理为取平均。
pairs <- aggregate(d$rating, d[c("subject_id", "image")], mean)
names(pairs)[3] <- "rating"
save_csv(pairs, "subject_image_ratings.csv")

summarize_groups <- function(dat, key) {
  rows <- lapply(split(seq_len(nrow(dat)), dat[[key]]), function(ii) {
    x <- dat$rating[ii]
    data.frame(id=dat[[key]][ii[1]], n=length(x), mean=mean(x),
               sd=sd(x), median=median(x), min=min(x), max=max(x))
  })
  ans <- do.call(rbind, rows); rownames(ans) <- NULL
  names(ans)[1] <- key
  ans
}
subject <- summarize_groups(pairs, "subject_id")
names(subject)[2] <- "n_images"
subject$complete <- subject$n_images == expected_images
subject$n_sessions <- vapply(subject$subject_id, function(s)
  length(unique(d$session_id[d$subject_id == s])), integer(1))
subject <- subject[order(subject$mean), ]
image_stats <- summarize_groups(pairs, "image")
names(image_stats)[2] <- "n_subjects"
image_stats <- image_stats[order(image_stats$mean), ]
save_csv(subject, "subject_summary.csv")
save_csv(image_stats, "image_summary.csv")

# 检验的是均值分布，不是将所有重复测量评分当作独立观测进行检验。
# 两组均值共享同一批图片/被试，以下检验仅用作探索性的分布诊断。
# 官方文档: https://stat.ethz.ch/R-manual/R-devel/library/stats/html/shapiro.test.html
normality <- function(x, label) {
  x <- x[is.finite(x)]; n <- length(x)
  eligible <- n >= 3 && n <= 5000 && sd(x) > 0
  test <- if (eligible) shapiro.test(x) else NULL
  data.frame(distribution=label, n=n, mean=mean(x), sd=sd(x), median=median(x),
    q25=unname(quantile(x,.25)), q75=unname(quantile(x,.75)), min=min(x), max=max(x),
    W=if (eligible) unname(test$statistic) else NA_real_,
    p_value=if (eligible) test$p.value else NA_real_,
    note=if (!eligible) "Not tested: n outside 3-5000 or zero variance" else
      if (test$p.value < .05) "Evidence against normality" else "No significant evidence against normality; not proof of normality")
}
results <- rbind(normality(subject$mean, "Subject means: all available"),
                 normality(image_stats$mean, "Image means: all available"))
# 完整被试敏感性分析：根据去重后覆盖125张图片判定，并非网站completed标志。
complete_ids <- subject$subject_id[subject$complete]
if (length(complete_ids)) {
  complete_pairs <- pairs[pairs$subject_id %in% complete_ids, ]
  complete_images <- summarize_groups(complete_pairs, "image")
  names(complete_images)[2] <- "n_subjects"
  save_csv(subject[subject$complete, ], "subject_summary_complete.csv")
  save_csv(complete_images, "image_summary_complete.csv")
  results <- rbind(results,
    normality(subject$mean[subject$complete], "Subject means: complete only"),
    normality(complete_images$mean, "Image means: complete subjects only"))
}
save_csv(results, "descriptives_normality.csv")

# 图片用英文轴标题避免中文字体问题；中文含义见说明文件。
# 直方图展示均值的分布；蓝线是同均值/标准差的参考正态密度，并非拟合结论。
distribution_plot <- function(x, label, color) {
  hist(x, breaks=seq(0,9,by=.5), probability=TRUE, col=color, border="white",
       main=paste(label, "distribution"), xlab="Mean fear rating (0-9)",
       ylab="Density", xlim=c(0,9))
  mu <- mean(x); sigma <- sd(x)
  if (length(x)>1 && sigma>0) curve(dnorm(x,mean=mu,sd=sigma),
                                    from=0,to=9,add=TRUE,col="#174A7E",lwd=2)
  abline(v=mean(x), col="#BA4B35", lty=2, lwd=2)
  mtext(sprintf("N=%d; M=%.2f; SD=%.2f",length(x),mean(x),sd(x)),cex=.8)
  qqnorm(x, main=paste(label, "normal Q-Q"), pch=19, col=color)
  if(length(x)>1 && sd(x)>0) qqline(x,col="#BA4B35",lwd=2)
}
png(file.path(out_dir,"mean_distributions.png"),width=2400,height=1800,res=200)
par(mfrow=c(2,2),mar=c(4.5,4.5,3.5,1))
distribution_plot(subject$mean,"Subject means","#75B7B1")
distribution_plot(image_stats$mean,"Image means","#D7A665")
dev.off()

# 排序柱状图表示每个编号的均值，不加容易混淆含义的误差线。
# P01等仅为图中匿名标签；对应关系保存在subject_plot_key.csv。
subject$plot_id <- sprintf("P%02d",seq_len(nrow(subject)))
save_csv(subject[c("plot_id","subject_id","n_images","mean")],"subject_plot_key.csv")
png(file.path(out_dir,"subject_mean_bars.png"),width=2200,height=1200,res=180)
par(mar=c(5,5,4,1))
barplot(subject$mean,names.arg=subject$plot_id,ylim=c(0,9),col="#75B7B1",
        border=NA,ylab="Mean fear rating (0-9)",xlab="Subject (sorted by mean)",
        main="Mean rating per subject")
abline(h=mean(subject$mean),lty=2,col="#BA4B35")
dev.off()
# 125张图片分页面画，避免所有文件名挤在同一张图。
pdf(file.path(out_dir,"image_mean_bars.pdf"),width=11,height=8)
for (first in seq(1,nrow(image_stats),by=30)) {
  part <- image_stats[first:min(first+29,nrow(image_stats)), ]
  par(mar=c(4,8,3,1))
  barplot(part$mean,names.arg=part$image,horiz=TRUE,las=1,xlim=c(0,9),
          col="#D7A665",border=NA,cex.names=.7,xlab="Mean fear rating (0-9)",
          main=sprintf("Image means: sorted ranks %d-%d",first,min(first+29,nrow(image_stats))))
}
dev.off()
if (length(complete_ids)) {
  png(file.path(out_dir,"mean_distributions_complete.png"),width=2400,height=1800,res=200)
  par(mfrow=c(2,2),mar=c(4.5,4.5,3.5,1))
  distribution_plot(subject$mean[subject$complete],"Complete subject means","#75B7B1")
  distribution_plot(complete_images$mean,"Image means (complete subjects)","#D7A665")
  dev.off()
}
writeLines(c(paste("Source:",input_file),paste("Raw rows:",nrow(raw)),
  paste("Analyzed rows:",nrow(d)),paste("Unique subject-image pairs:",nrow(pairs)),
  paste("Subjects:",nrow(subject)),paste("Images:",nrow(image_stats)),
  paste("Complete subjects:",length(complete_ids)),
  "Repeated subject-image ratings: averaged before aggregation.",
  "Incomplete subjects: included in main analysis; complete-only results also exported.",
  "All means use observed scores only; missing scores are not replaced with zero.",
  "Same ID is assumed to identify the same person across sessions.",
  "With incomplete data, subjects may rate different image sets; compare cautiously.",
  "Shapiro-Wilk p>=0.05 does not establish normality; inspect Q-Q plots too.",
  "Normality tests are exploratory; means share participants/images.",
  "Do not delete outliers or transform ratings solely to pass a normality test."),
  file.path(out_dir,"analysis_notes.txt"))
capture.output(sessionInfo(),file=file.path(out_dir,"R_session_info.txt"))
print(results)
cat("\nResults saved to:",out_dir,"\n")
