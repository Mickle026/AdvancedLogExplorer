define(["require", "jQuery", "globalize", "emby-button", "emby-select", "emby-input", "emby-checkbox"],
    function (require, $, globalize) {

        var view = null;

        var lastResult = "";        // raw text returned by server for current filter
        var filteredResult;
var rawResult = "";    // server-side filtered text (we display as-is)
        var autoRefreshTimer = null;

        // Live search
        var searchMatches = [];
        var currentMatchIndex = -1;

        // Mapping filtered-view line index -> original source line index (after blank-line removal)
        var viewIndexToSourceIndex = [];

        // ---------- Helpers: coloring & highlighting ----------
        function colorizeLine(line) {
            if (/error|exception/i.test(line)) return "<span style='color:#ff5555;'>" + escapeHtml(line) + "</span>";
            if (/warn/i.test(line)) return "<span style='color:#ffb86c;'>" + escapeHtml(line) + "</span>";
            if (/info/i.test(line)) return "<span style='color:#8be9fd;'>" + escapeHtml(line) + "</span>";
            if (/debug/i.test(line)) return "<span style='color:#50fa7b;'>" + escapeHtml(line) + "</span>";
            return escapeHtml(line);
        }


        function escapeHtml(s) {
            if (!s) return "";
            return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }

        function highlightSearch(text, search, viewLineIdx) {
            if (!search) return text;

            var caseSensitive = $("#caseSensitiveToggle", view).prop("checked");
            var regexMode = $("#regexToggle", view).prop("checked");
            var flags = caseSensitive ? "g" : "gi";

            var regex;
            try {
                regex = regexMode ? new RegExp(search, flags)
                    : new RegExp("(" + search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", flags);
            } catch {
                regex = new RegExp("(" + search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", flags);
            }

            var hasMatch = false;
            var replaced = text.replace(regex, function (m) {
                hasMatch = true;
                return "<span class='searchMatch' data-vline='" + viewLineIdx + "' style='background:yellow;color:black;'>" + m + "</span>";
            });
            if (hasMatch) searchMatches.push(viewLineIdx);
            return replaced;
        }

        // ---------- Rendering ----------
        function renderOutput(text) {
            var html = "";
            var lines = text ? text.split(/\r?\n/) : [];
            var search = $("#liveSearch", view).val();

            viewIndexToSourceIndex = [];
            searchMatches = [];
            currentMatchIndex = -1;

            var visibleIdx = 0;
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                if (!line || /^\s*$/.test(line)) continue; // strip blank/whitespace-only
                var vIdx = visibleIdx++;

                viewIndexToSourceIndex.push(i);

                var colored = colorizeLine(line);
                colored = highlightSearch(colored, search, vIdx);

                html += "<div id='linev-" + vIdx + "'><span style='color:#888;'>" +
                    (vIdx + 1).toString().padStart(5, " ") + " </span>" + colored + "</div>";
            }

            $("#logOutput", view).html(html);

            if (search) {
                $("#searchCount", view).text(searchMatches.length + " matches");
                if (searchMatches.length > 0) scrollToMatch(0); // auto-jump to first
            } else {
                $("#searchCount", view).text("");
            }

            if ($("#autoScrollToggle", view).prop("checked") && !search) {
                var output = $("#logOutput", view).get(0);
                if (output) output.scrollTop = output.scrollHeight;
            }
        }

        function renderRaw(text) {
            var html = "";
            var lines = text ? text.split(/\r?\n/).filter(function (line) {
                return line.trim().length > 0;
            }) : [];

            var search = $("#liveSearch", view).val();

            var visibleIdx = 0;
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                // Keep blank lines in raw view
                var vIdx = visibleIdx++;

                var colored = colorizeLine(line);
                if (!line || /^\s*$/.test(line)) { colored = "&nbsp;"; }
                // For raw we don't need searchMatches; highlight for visual only
                colored = highlightSearch(colored, search, vIdx);

                // ID uses original source index so we can sync from filtered view
                html += "<div id='raw-line-" + i + "'><span style='color:#666;'>" +
                    (vIdx + 1).toString().padStart(5, " ") + " </span>" + colored + "</div>";
            }

            $("#rawLogOutput", view).html(html);

            if ($("#autoScrollToggle", view).prop("checked") && !search) {
                var output = $("#rawLogOutput", view).get(0);
                if (output) output.scrollTop = output.scrollHeight;
            }
        }

        function scrollToMatch(index) {
            if (index < 0 || index >= searchMatches.length) return;
            currentMatchIndex = index;
            var vLine = searchMatches[currentMatchIndex];

            // Filtered view
            var $line = $("#linev-" + vLine, view);
            if ($line.length) {
                $("#logOutput div", view).removeClass("activeMatchLine");
                $line[0].scrollIntoView({ behavior: "smooth", block: "center" });
                $line.addClass("activeMatchLine");
                $(".searchMatch", view).css("outline", "none");
                $line.find(".searchMatch").css("outline", "2px solid orange");
            }

            // Raw view (sync by original source index)
            if ($("#splitViewToggle", view).prop("checked")) {
                var srcIdx = viewIndexToSourceIndex[vLine];
                var $raw = $("#raw-line-" + srcIdx, view);
                if ($raw.length) {
                    $("#rawLogOutput div", view).removeClass("activeMatchLine");
                    $raw[0].scrollIntoView({ behavior: "smooth", block: "center" });
                    $raw.addClass("activeMatchLine");
                    $raw.find(".searchMatch").css("outline", "2px solid orange");
                }
            }
        }

        // ---------- Server calls ----------
        function loadPluginFilters(file) {
            $("#pluginFilter", view).empty().append($("<option>").val("").text(""));
            if (!file) return;

            ApiClient.getJSON(ApiClient.getUrl("AdvancedLogExplorer/GetPluginFilters", { File: file }))
                .then(function (plugins) {
                    var sel = $("#pluginFilter", view).empty();
                    sel.append($("<option>").val("").text(""));
                    (plugins || []).forEach(function (p) {
                        sel.append($("<option>").val("plugin:" + p).text(p));
                    });
                })
                .catch(function (e) { console.warn("GetPluginFilters failed", e); });
        }

        function applyFilter() {
            var file = $("#logFileSelect", view).val();
            var k1 = $("#keyword1", view).val();
            var k2 = $("#keyword2", view).val();
            var op = $("#operator", view).val();
            var preset = $("#preset", view).val();
            var plugin = $("#pluginFilter", view).val();
            var lines = parseInt($("#lineLimit", view).val(), 10) || 0;

            if (plugin) preset = plugin;

            ApiClient.getJSON(ApiClient.getUrl("AdvancedLogExplorer/GetLogContent", {
                File: file,
                Keyword1: k1,
                Keyword2: k2,
                Operator: op,
                Preset: preset,
                Lines: lines
            })).then(function (resp) {
                var text = (resp && resp.Content) ? resp.Content : "";
                // Use Raw if available, else fallback to text
                rawResult = (resp && typeof resp.Raw === "string") ? resp.Raw : text;
                lastResult = text;
                filteredResult = text;

                renderOutput(filteredResult);
                renderRaw(rawResult);

                if ($("#splitViewToggle", view).prop("checked")) {
                    $("#rawLogContainer", view).addClass("open");
                    renderRaw(rawResult);
                } else {
                    $("#rawLogContainer", view).removeClass("open");
                }
            }).catch(function (e) { console.error("GetLogContent failed", e); });
        }

        function checkLogRotation() {
            var currentFile = $("#logFileSelect", view).val();
            if (!currentFile) return;

            var base = currentFile.replace(/-\d+\.txt$/, ".txt");
            var prefix = base.replace(/\.txt$/, "");

            ApiClient.getJSON(ApiClient.getUrl("AdvancedLogExplorer/GetLogs"))
                .then(function (files) {
                    if (!files || files.length === 0) return;
                    var newest = files.find(function (f) { return f.indexOf(prefix) === 0; });
                    if (newest && newest !== currentFile) {
                        $("#logFileSelect", view).val(newest);
                        loadPluginFilters(newest);
                        applyFilter();
                    }
                })
                .catch(function (e) { console.warn("GetLogs (rotation) failed", e); });
        }

        function startAutoRefresh() {
            stopAutoRefresh();
            var interval = parseInt($("#autoRefreshInterval", view).val(), 10) || 5000;
            autoRefreshTimer = setInterval(function () {
                if ($("#rotationToggle", view).prop("checked")) checkLogRotation();
                applyFilter();
            }, interval);
        }

        function stopAutoRefresh() {
            if (autoRefreshTimer) clearInterval(autoRefreshTimer);
            autoRefreshTimer = null;
        }

        function loadLogs() {
            ApiClient.getJSON(ApiClient.getUrl("AdvancedLogExplorer/GetLogs")).then(function (files) {
                var sel = $("#logFileSelect", view).empty();
                (files || []).forEach(function (f) {
                    sel.append($("<option>").attr("value", f).text(f));
                });

                var defaultFile = "embyserver.txt";
                if (files && files.includes(defaultFile)) sel.val(defaultFile);
                else if (files && files.length > 0) sel.val(files[0]);

                var file = sel.val();
                loadPluginFilters(file);
                applyFilter();
            }).catch(function (e) { console.error("GetLogs failed", e); });
        }

        // ---------- Export / Copy / Download ----------
        function copyFiltered() {
            var text = filteredResult || "";
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
            } else fallbackCopy(text);
        }
        function fallbackCopy(text) {
            var ta = document.createElement("textarea");
            ta.value = text; ta.style.position = "fixed"; ta.style.left = "-1000px";
            document.body.appendChild(ta); ta.select();
            try { document.execCommand("copy"); } catch { }
            document.body.removeChild(ta);
        }

        function copyRaw() {
            var text = rawResult || "";
            if (navigator.clipboard && navigator.clipboard.writeText);
            }
        

        function downloadFiltered() {
            var blob = new Blob([filteredResult || ""], { type: "text/plain" });
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            var file = $("#logFileSelect", view).val() || "log";
            a.href = url; a.download = "Filtered_" + file; a.click();
            URL.revokeObjectURL(url);
        }

        function downloadRaw() {
            var blob = new Blob([rawResult || ""], { type: "text/plain" });
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            var file = $("#logFileSelect", view).val() || "log";
            a.href = url; a.download = "RawLog_" + file; a.click();
            URL.revokeObjectURL(url);
        }

        // ---------- Controller ----------
        return function (page) {
            view = page;

            page.addEventListener("viewshow", function () {
                loadLogs();

                // Auto-focus search
                setTimeout(function () { $("#liveSearch", view).focus(); }, 300);

                // File + filters
                $(view).on("change", "#logFileSelect", function () {
                    loadPluginFilters(this.value);
                    applyFilter();
                });
                $(view).on("change", "#preset,#pluginFilter,#operator,#lineLimit", applyFilter);

                // Apply / Refresh (auto-close modal)
                $(view).on("click", "#applyFilter", function () {
                    applyFilter();
                    $("#settingsModal", view).hide();
                });
                $(view).on("click", "#refreshBtn", function () {
                    applyFilter();
                    $("#settingsModal", view).hide();
                });

                // Settings modal open/close (main + quick gear)
                $(view).on("click", "#settingsBtn", function () {
                    $("#settingsModal", view).show();
                });
                $(view).on("click", "#quickSettings", function () {
                    $("#settingsModal", view).show();
                });
                $(view).on("click", "#closeSettings", function () {
                    $("#settingsModal", view).hide();
                });
                $(view).on("click", "#settingsModal", function (e) {
                    if (e.target.id === "settingsModal") $(this).hide(); // click backdrop
                });

                // Auto refresh
                $(view).on("change", "#autoRefreshToggle", function () {
                    if (this.checked) startAutoRefresh(); else stopAutoRefresh();
                });
                $(view).on("change", "#autoRefreshInterval", function () {
                    if ($("#autoRefreshToggle", view).prop("checked")) startAutoRefresh();
                });

                // Split view
                $(view).on("change", "#splitViewToggle", function () {
                    if (this.checked) {
                        $("#rawLogContainer", view).addClass("open");
                        renderRaw(rawResult);
                        if (searchMatches.length > 0) {
                            scrollToMatch(currentMatchIndex >= 0 ? currentMatchIndex : 0);
                        }
                    } else {
                        $("#rawLogContainer", view).removeClass("open");
                    }
                });

                // Live search + toggles
                $(view).on("input", "#liveSearch", function () {
                    renderOutput(lastResult);
                    if ($("#splitViewToggle", view).prop("checked")) renderRaw(rawResult);
                });
                $(view).on("change", "#caseSensitiveToggle,#regexToggle", function () {
                    renderOutput(lastResult);
                    if ($("#splitViewToggle", view).prop("checked")) renderRaw(rawResult);
                });

                // Nav + clear
                $(view).on("click", "#nextMatchBtn", function () {
                    if (searchMatches.length > 0) scrollToMatch((currentMatchIndex + 1) % searchMatches.length);
                });
                $(view).on("click", "#prevMatchBtn", function () {
                    if (searchMatches.length > 0) scrollToMatch((currentMatchIndex - 1 + searchMatches.length) % searchMatches.length);
                });
                $(view).on("click", "#clearSearchBtn", function () {
                    $("#liveSearch", view).val("");
                    $("#searchCount", view).text("");
                    searchMatches = []; currentMatchIndex = -1;
                    renderOutput(lastResult);
                    if ($("#splitViewToggle", view).prop("checked")) renderRaw(rawResult);
                    $("#liveSearch", view).focus();
                });

                // Keyboard shortcuts
                $(view).on("keydown", "#liveSearch", function (e) {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        if (searchMatches.length === 0) return;
                        if (e.shiftKey) scrollToMatch((currentMatchIndex - 1 + searchMatches.length) % searchMatches.length);
                        else scrollToMatch((currentMatchIndex + 1) % searchMatches.length);
                    } else if (e.key === "Escape") {
                        e.preventDefault();
                        $("#clearSearchBtn", view).click();
                    }
                });
                $(document).on("keydown.ale", function (e) {
                    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
                        e.preventDefault();
                        $("#liveSearch", view).focus().select();
                    }
                });

                // Search modal open/close
                $(view).on("click", "#searchBtn", function () {
                    $("#searchModal", view).show();
                    setTimeout(function () { $("#liveSearch", view).focus(); }, 200);
                });
                $(view).on("click", "#closeSearch", function () {
                    $("#searchModal", view).hide();
                });
                $(view).on("click", "#searchModal", function (e) {
                    if (e.target.id === "searchModal") $(this).hide(); // click backdrop
                });

                // Export / Copy / Download
                $(view).on("click", "#copyBtn", copyFiltered);
                $(view).on("click", "#downloadBtn", downloadFiltered);
                $(view).on("click", "#copyRawBtn", copyRaw);
                $(view).on("click", "#downloadRawBtn", downloadRaw);
            });

            page.addEventListener("viewhide", function () {
                stopAutoRefresh();
                $(document).off("keydown.ale");
            });
        };
    });
