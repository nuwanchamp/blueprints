# =============================================================
#  Keyboard Skills Adventure with Pip
#  UNIT 2 — PRACTICE — "Word Train"
#  Skill: whole-word typing practice (replayable, no star)
#
#  DESIGN NOTE: not a numbered curriculum level — no LEVEL_NUMBER,
#  never touches StarChart. A calmer companion to "Zig's Speed
#  Round": that one is about speed across the whole keyboard, this
#  one is about the satisfaction of typing a whole word, inspired
#  by grown-up touch-typing drills (keybr.com) but simplified for
#  young kids — one big word at a time, not a wall of text.
#
#  No recorded narration exists for this screen yet — text-only,
#  same as Zig's Speed Round.
#
#  MECHANIC
#  - One word shows at a time, drawn as big rounded bubble-letters
#    that start hollow (outline only) — the whole word's shape is
#    visible upfront, like a coloring page.
#  - Typing the next correct letter (in order) fills that one
#    letter with a random bright color and a little pop. A wrong
#    key just gets a gentle wobble — nothing is lost, so there's
#    no need for Backspace/undo.
#  - Finishing a word: a bigger celebration, then that word slides
#    away to the left while the next word marches in from the
#    right to take its place — one task in view at a time.
#  - Before each round, pick a difficulty (Easy/Medium/Tricky) so a
#    grown-up can match the word list to what a specific child is
#    ready for.
#  - A short round (words_per_round, default 8 — see Data/practice_
#    settings.cfg), then a warm "Play Again" summary, same pattern
#    as Zig's Speed Round.
#
#  WORD LIST: read from a plain text file, not hardcoded, so it can
#  be edited without touching a script:
#    1. Data/word_practice_words.tsv next to this project's assets
#       (bundled into the game at export time — edit the source file
#       and re-export to change it).
#    2. If a file of the same name sits next to the exported .exe,
#       THAT copy wins instead — lets someone tweak the word list on
#       an already-shipped copy of the game with no rebuild. (This
#       only ever triggers in an exported build: in the editor,
#       OS.get_executable_path() points at the Godot editor itself,
#       so the check harmlessly finds nothing and falls through.)
#  Either file uses the same WORD<tab>LEVEL format — see the comment
#  at the top of Data/word_practice_words.tsv.
#
#  Godot 4.x
# =============================================================
extends Node2D

const NEXT_MENU_SCENE := "res://Scenes/unit2-level-menu.tscn"

const WORDS_FILE_PATH := "res://Data/word_practice_words.tsv"
const EXTERNAL_WORDS_FILENAME := "word_practice_words.tsv"
# Used only if no word file can be found/parsed at all, so the mode
# never breaks outright even with a missing or badly-edited file.
const FALLBACK_WORD_BANK: Array[String] = ["CAT", "DOG", "SUN", "STAR", "ZIG"]

const LEVEL_NAMES := {1: "Easy", 2: "Medium", 3: "Tricky"}
const LEVEL_HINTS := {1: "short & simple", 2: "a bit longer", 3: "biggest challenge"}
const LEVEL_COLORS := {1: Color("06d6a0"), 2: Color("ffd166"), 3: Color("ff8fab")}

const SETTINGS_FILE_PATH := "res://Data/practice_settings.cfg"
const EXTERNAL_SETTINGS_FILENAME := "practice_settings.cfg"
const DEFAULT_WORDS_PER_ROUND := 8
const IDLE_HINT_SECONDS := 8.0

const LETTER_FONT_SIZE := 72
const LETTER_GAP := 10.0
const OUTLINE_COLOR := Color("2c6e68")
const OUTLINE_SIZE := 9
const SLIDE_DURATION := 0.5
const SLIDE_DISTANCE := 620.0   # how far off-screen the word starts/ends

const FILL_COLORS: Array[Color] = [
	Color("ff6b6b"), Color("ffd166"), Color("06d6a0"),
	Color("6b7fd7"), Color("ff8fab"), Color("f4a259"),
]

const COL_BG   := Color("e0f7f4")   # same fresh minty pastel as the rest of Unit 2
const GOLD := Color("ffd166")
const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")
const ZIG_TEXTURE: Texture2D = preload("res://Assets/keyboard-mascot-trans.png")
const HAND_CURSOR: Texture2D = preload("res://Assets/pointer.png")

var _words_per_round := DEFAULT_WORDS_PER_ROUND

var _words_by_level: Dictionary = {}   # int level -> Array (see _to_string_array)
var _active_words: Array[String] = []
var _selected_level := 1
var _bag: Array[String] = []
var _last_word := ""

var _current_word := ""
var _next_index := 0
var _words_done := 0
var _finished := false

var _word_layer: CanvasLayer
var _word_box: Control
var _letter_labels: Array[Label] = []

var _zig: Sprite2D
var _instruction_label: RichTextLabel
var _progress_label: Label
var _idle_timer: Timer


func _ready() -> void:
	StarChart.hide_chart()
	Input.set_custom_mouse_cursor(HAND_CURSOR)
	randomize()

	_load_settings()
	_words_by_level = _load_words_by_level()

	var bg := ColorRect.new()
	bg.color = COL_BG
	bg.anchor_right = 1.0
	bg.anchor_bottom = 1.0
	var bg_layer := CanvasLayer.new()
	bg_layer.layer = -10
	bg_layer.add_child(bg)
	add_child(bg_layer)

	_show_difficulty_picker()


# ----------------------------------------------------------------
#  Difficulty picker: shown before the round starts, so a grown-up
#  can match the word list to what a specific child is ready for.
# ----------------------------------------------------------------
func _show_difficulty_picker() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 15
	add_child(layer)

	var title := RichTextLabel.new()
	title.bbcode_enabled = true
	title.fit_content = true
	title.scroll_active = false
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title.add_theme_font_override("normal_font", UI_FONT)
	title.add_theme_font_size_override("normal_font_size", 34)
	title.add_theme_color_override("font_outline_color", Color("1d4a46"))
	title.add_theme_constant_override("outline_size", 9)
	title.anchor_left = 0.05
	title.anchor_right = 0.95
	title.anchor_top = 0.16
	title.anchor_bottom = 0.28
	title.text = (
		"[center][rainbow freq=0.25 sat=0.55 val=0.95]"
		+ "Pick a word level!"
		+ "[/rainbow][/center]"
	)
	layer.add_child(title)

	var levels := [1, 2, 3]
	var card_size := Vector2(280, 240)
	var gap := 40.0
	var total_w := card_size.x * levels.size() + gap * (levels.size() - 1)
	var left := _screen_size().x * 0.5 - total_w * 0.5
	var top := _screen_size().y * 0.5 - card_size.y * 0.5 + 20.0

	for i in levels.size():
		var level: int = levels[i]
		var pos := Vector2(left + i * (card_size.x + gap), top)
		_build_level_card(layer, pos, card_size, level)


func _build_level_card(layer: CanvasLayer, pos: Vector2, size: Vector2, level: int) -> void:
	var btn := Button.new()
	btn.position = pos
	btn.size = size

	var normal := StyleBoxFlat.new()
	normal.bg_color = Color(1, 1, 1, 1)
	normal.border_width_left = 5
	normal.border_width_top = 5
	normal.border_width_right = 5
	normal.border_width_bottom = 5
	normal.border_color = LEVEL_COLORS[level]
	normal.corner_radius_top_left = 22
	normal.corner_radius_top_right = 22
	normal.corner_radius_bottom_right = 22
	normal.corner_radius_bottom_left = 22
	normal.shadow_color = Color(0.158, 0.158, 0.158, 0.4)
	normal.shadow_size = 4
	normal.shadow_offset = Vector2(4, 5)
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = LEVEL_COLORS[level].lightened(0.75)
	btn.add_theme_stylebox_override("normal", normal)
	btn.add_theme_stylebox_override("pressed", normal)
	btn.add_theme_stylebox_override("hover", hover)
	btn.pressed.connect(func () -> void: _on_level_chosen(level, layer))
	layer.add_child(btn)

	var name_label := Label.new()
	name_label.text = LEVEL_NAMES[level]
	name_label.add_theme_font_override("font", UI_FONT)
	name_label.add_theme_font_size_override("font_size", 30)
	name_label.add_theme_color_override("font_color", Color("2c6e68"))
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	name_label.anchor_left = 0.0
	name_label.anchor_right = 1.0
	name_label.anchor_top = 0.3
	name_label.anchor_bottom = 0.55
	btn.add_child(name_label)

	var hint_label := Label.new()
	hint_label.text = LEVEL_HINTS[level]
	hint_label.add_theme_font_size_override("font_size", 18)
	hint_label.add_theme_color_override("font_color", Color("3a2e4d"))
	hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hint_label.anchor_left = 0.08
	hint_label.anchor_right = 0.92
	hint_label.anchor_top = 0.6
	hint_label.anchor_bottom = 0.78
	btn.add_child(hint_label)


func _on_level_chosen(level: int, picker_layer: CanvasLayer) -> void:
	picker_layer.queue_free()
	_selected_level = level
	_active_words = _to_string_array(_words_by_level.get(level, []))
	if _active_words.is_empty():
		# That tier has no words yet (e.g. a hand-edited file only
		# filled in Easy) — fall back to Easy rather than a dead end.
		_active_words = _to_string_array(_words_by_level.get(1, FALLBACK_WORD_BANK))
	_start_round()


# Dictionary values come back as plain Variant/Array, even when every
# element is a String — Godot won't implicitly narrow that to the
# statically-typed Array[String] our fields declare, so convert by hand.
func _to_string_array(source: Array) -> Array[String]:
	var typed: Array[String] = []
	for item in source:
		typed.append(str(item))
	return typed


func _start_round() -> void:
	_build_zig()
	_build_ui()

	_word_layer = CanvasLayer.new()
	_word_layer.layer = 5
	add_child(_word_layer)

	_idle_timer = Timer.new()
	_idle_timer.wait_time = IDLE_HINT_SECONDS
	_idle_timer.one_shot = true
	_idle_timer.timeout.connect(_on_idle_hint)
	add_child(_idle_timer)

	_show_instruction("Type the glowing letter to color it in!")
	_spawn_word(false)


func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null)


func _screen_size() -> Vector2:
	return get_viewport_rect().size


# ----------------------------------------------------------------
#  Zig, cheering quietly to one side
# ----------------------------------------------------------------
func _build_zig() -> void:
	_zig = Sprite2D.new()
	_zig.texture = ZIG_TEXTURE
	_zig.scale = Vector2.ONE * (200.0 / ZIG_TEXTURE.get_width())
	_zig.position = Vector2(140.0, _screen_size().y - 130.0)
	add_child(_zig)


func _cheer_zig() -> void:
	var base_scale := _zig.scale
	var t := create_tween()
	t.tween_property(_zig, "scale", base_scale * 1.15, 0.12)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.tween_property(_zig, "scale", base_scale, 0.25)\
		.set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)


# ----------------------------------------------------------------
#  Settings (round size) — same external-file-first, then bundled,
#  lookup as the word list, so it's editable post-ship without a
#  rebuild. See Data/practice_settings.cfg.
# ----------------------------------------------------------------
func _load_settings() -> void:
	var external_path := OS.get_executable_path().get_base_dir().path_join(EXTERNAL_SETTINGS_FILENAME)
	var path := external_path if FileAccess.file_exists(external_path) else SETTINGS_FILE_PATH
	var cfg := ConfigFile.new()
	if cfg.load(path) != OK:
		return
	var value: int = cfg.get_value("word_train", "words_per_round", _words_per_round)
	_words_per_round = maxi(1, value)


# ----------------------------------------------------------------
#  Word list — see the file-location and format notes in the header
#  comment at the top of this script. Returns {level: Array}, plain
#  untyped Arrays — see _to_string_array() for why.
# ----------------------------------------------------------------
func _load_words_by_level() -> Dictionary:
	var external_path := OS.get_executable_path().get_base_dir().path_join(EXTERNAL_WORDS_FILENAME)
	var path := external_path if FileAccess.file_exists(external_path) else WORDS_FILE_PATH

	var by_level: Dictionary = {}
	var file := FileAccess.open(path, FileAccess.READ)
	if file:
		while not file.eof_reached():
			var line := file.get_line().strip_edges()
			if line.is_empty() or line.begins_with("#"):
				continue
			var cols := line.split("\t")
			var word := cols[0].strip_edges().to_upper()
			if word.is_empty():
				continue
			var valid := true
			for ch in word:
				if ch < "A" or ch > "Z":
					valid = false
					break
			if not valid:
				continue
			var level := 1
			if cols.size() > 1:
				var parsed := cols[1].strip_edges().to_int()
				if parsed >= 1 and parsed <= 3:
					level = parsed
			var bucket: Array = by_level.get(level, [])
			bucket.append(word)
			by_level[level] = bucket

	if by_level.is_empty():
		by_level[1] = FALLBACK_WORD_BANK.duplicate()
	return by_level


# ----------------------------------------------------------------
#  Word "bag" — every word gets a fair turn before any repeat.
# ----------------------------------------------------------------
func _draw_word() -> String:
	if _bag.is_empty():
		_bag = _active_words.duplicate()
		_bag.shuffle()
		if _bag.size() > 1 and _bag[0] == _last_word:
			var tmp := _bag[0]
			_bag[0] = _bag[1]
			_bag[1] = tmp
	var word: String = _bag.pop_back()
	_last_word = word
	return word


# ----------------------------------------------------------------
#  Building and animating a word
# ----------------------------------------------------------------
func _spawn_word(from_right: bool) -> void:
	_current_word = _draw_word()
	_next_index = 0

	var widths: Array[float] = []
	var cursor_x := 0.0
	for ch in _current_word:
		var w: float = UI_FONT.get_string_size(ch, HORIZONTAL_ALIGNMENT_LEFT, -1, LETTER_FONT_SIZE).x
		widths.append(w)
		cursor_x += w + LETTER_GAP
	var total_width: float = cursor_x - LETTER_GAP

	_word_box = Control.new()
	var center_x := _screen_size().x * 0.5 - total_width * 0.5
	var center_y := _screen_size().y * 0.42 - LETTER_FONT_SIZE * 0.5
	_word_box.position = Vector2(
		center_x + (SLIDE_DISTANCE if from_right else 0.0), center_y
	)
	_word_box.size = Vector2(total_width, LETTER_FONT_SIZE)
	_word_layer.add_child(_word_box)

	_letter_labels.clear()
	var x := 0.0
	for i in _current_word.length():
		var label := Label.new()
		label.text = _current_word[i]
		label.add_theme_font_override("font", UI_FONT)
		label.add_theme_font_size_override("font_size", LETTER_FONT_SIZE)
		label.add_theme_color_override("font_color", COL_BG)   # hollow until typed
		label.add_theme_color_override("font_outline_color", OUTLINE_COLOR)
		label.add_theme_constant_override("outline_size", OUTLINE_SIZE)
		label.position = Vector2(x, 0.0)
		label.pivot_offset = Vector2(widths[i] * 0.5, LETTER_FONT_SIZE * 0.5)
		_word_box.add_child(label)
		_letter_labels.append(label)
		x += widths[i] + LETTER_GAP

	if from_right:
		var t := create_tween()
		t.tween_property(_word_box, "position:x", center_x, SLIDE_DURATION)\
			.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

	_show_instruction("Type the letter %s!" % _current_word[0])
	_idle_timer.start()


func _fill_current_letter() -> void:
	var label := _letter_labels[_next_index]
	var color := FILL_COLORS[randi() % FILL_COLORS.size()]
	var t := create_tween()
	t.tween_method(
		func (c: Color) -> void: label.add_theme_color_override("font_color", c),
		COL_BG, color, 0.12
	)
	t.parallel().tween_property(label, "scale", Vector2.ONE * 1.3, 0.1)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.tween_property(label, "scale", Vector2.ONE, 0.2)\
		.set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)
	_play_tick()


func _wobble_word() -> void:
	_word_box.pivot_offset = Vector2(_word_box.size.x * 0.5, LETTER_FONT_SIZE * 0.5)
	var t := create_tween()
	t.tween_property(_word_box, "rotation", 0.05, 0.06)
	t.tween_property(_word_box, "rotation", -0.05, 0.06)
	t.tween_property(_word_box, "rotation", 0.0, 0.06)


# ----------------------------------------------------------------
#  Input
# ----------------------------------------------------------------
func _input(event: InputEvent) -> void:
	if _finished or _word_box == null or not (event is InputEventKey):
		return
	var key := event as InputEventKey
	if not key.pressed or key.echo:
		return
	_idle_timer.start()

	var pressed := OS.get_keycode_string(key.keycode).to_upper()
	var target := _current_word[_next_index]
	if pressed == target:
		_fill_current_letter()
		_next_index += 1
		if _next_index >= _current_word.length():
			_on_word_complete()
		else:
			_show_instruction("Type the letter %s!" % _current_word[_next_index])
	elif pressed.length() == 1 and pressed >= "A" and pressed <= "Z":
		_wobble_word()
		_show_instruction("Almost — look for the letter %s!" % target)
	# Non-letter keys are silently ignored.


# ----------------------------------------------------------------
#  Word complete: bigger celebration, then slide out / next word in.
# ----------------------------------------------------------------
func _on_word_complete() -> void:
	_idle_timer.stop()
	_words_done += 1
	_progress_label.text = "%d / %d" % [_words_done, _words_per_round]
	_cheer_zig()
	_play_chime()
	Confetti.rain(16, 0.25, Vector2(
		_word_box.global_position.x, _word_box.global_position.x + 200.0
	))

	var finished_box := _word_box
	_word_box = null
	var t := create_tween()
	t.tween_property(finished_box, "position:x", finished_box.position.x - SLIDE_DISTANCE, SLIDE_DURATION)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	t.parallel().tween_property(finished_box, "modulate:a", 0.0, SLIDE_DURATION)
	t.tween_callback(finished_box.queue_free)

	if _words_done >= _words_per_round:
		_finished = true
		_show_instruction("You finished the whole round! Amazing typing!")
		get_tree().create_timer(SLIDE_DURATION + 0.6).timeout.connect(_show_summary)
	else:
		get_tree().create_timer(SLIDE_DURATION * 0.5).timeout.connect(func () -> void: _spawn_word(true))


# ----------------------------------------------------------------
#  Idle hint: glow the next letter that's needed.
# ----------------------------------------------------------------
func _on_idle_hint() -> void:
	if _finished or _word_box == null or _next_index >= _letter_labels.size():
		return
	_show_instruction("Type the letter %s!" % _current_word[_next_index])
	var label := _letter_labels[_next_index]
	var t := create_tween()
	for i in 3:
		t.tween_method(
			func (c: Color) -> void: label.add_theme_color_override("font_outline_color", c),
			OUTLINE_COLOR, GOLD, 0.25
		).set_trans(Tween.TRANS_SINE)
		t.tween_method(
			func (c: Color) -> void: label.add_theme_color_override("font_outline_color", c),
			GOLD, OUTLINE_COLOR, 0.25
		).set_trans(Tween.TRANS_SINE)
	_idle_timer.start()


# ----------------------------------------------------------------
#  Round summary (same pattern as Zig's Speed Round)
# ----------------------------------------------------------------
func _show_summary() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 20
	add_child(layer)

	var panel_size := Vector2(560, 360)
	var panel := Panel.new()
	var box := StyleBoxFlat.new()
	box.bg_color = Color(1, 1, 1, 1)
	box.border_width_left = 5
	box.border_width_top = 5
	box.border_width_right = 5
	box.border_width_bottom = 5
	box.border_color = Color("2c6e68")
	box.corner_radius_top_left = 22
	box.corner_radius_top_right = 22
	box.corner_radius_bottom_right = 22
	box.corner_radius_bottom_left = 22
	box.shadow_color = Color(0.158, 0.158, 0.158, 0.5)
	box.shadow_size = 4
	box.shadow_offset = Vector2(4, 6)
	panel.add_theme_stylebox_override("panel", box)
	panel.position = _screen_size() * 0.5 - panel_size * 0.5
	panel.size = panel_size
	layer.add_child(panel)

	var title := RichTextLabel.new()
	title.bbcode_enabled = true
	title.fit_content = true
	title.scroll_active = false
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title.add_theme_font_override("normal_font", UI_FONT)
	title.add_theme_font_size_override("normal_font_size", 32)
	title.add_theme_color_override("font_outline_color", Color("1d4a46"))
	title.add_theme_constant_override("outline_size", 8)
	title.anchor_left = 0.05
	title.anchor_right = 0.95
	title.anchor_top = 0.1
	title.anchor_bottom = 0.28
	title.text = (
		"[center][rainbow freq=0.25 sat=0.55 val=0.95]"
		+ "All Words Done! 🎉"
		+ "[/rainbow][/center]"
	)
	panel.add_child(title)

	var stats := Label.new()
	stats.text = "You typed %d words all by yourself!" % _words_per_round
	stats.add_theme_font_size_override("font_size", 24)
	stats.add_theme_color_override("font_color", Color("2c6e68"))
	stats.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	stats.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	stats.autowrap_mode = TextServer.AUTOWRAP_WORD
	stats.anchor_left = 0.08
	stats.anchor_right = 0.92
	stats.anchor_top = 0.34
	stats.anchor_bottom = 0.52
	panel.add_child(stats)

	var again_btn := _make_summary_button("🔄  Play Again", 0.6)
	again_btn.pressed.connect(func () -> void: get_tree().reload_current_scene())
	panel.add_child(again_btn)

	var menu_btn := _make_summary_button("📋  Level Menu", 0.78)
	menu_btn.pressed.connect(func () -> void: get_tree().change_scene_to_file(NEXT_MENU_SCENE))
	panel.add_child(menu_btn)


func _make_summary_button(text: String, anchor_y: float) -> Button:
	var btn := Button.new()
	btn.text = text
	btn.add_theme_font_override("font", UI_FONT)
	btn.add_theme_font_size_override("font_size", 26)
	btn.anchor_left = 0.5
	btn.anchor_right = 0.5
	btn.anchor_top = anchor_y
	btn.anchor_bottom = anchor_y
	btn.offset_left = -130
	btn.offset_right = 130
	btn.offset_top = 0
	btn.offset_bottom = 62

	var normal := StyleBoxFlat.new()
	normal.bg_color = Color(1, 1, 1, 1)
	normal.border_width_left = 4
	normal.border_width_top = 4
	normal.border_width_right = 4
	normal.border_width_bottom = 4
	normal.border_color = Color(0.0018, 0.0018, 0.0018, 1)
	normal.corner_radius_top_left = 14
	normal.corner_radius_top_right = 14
	normal.corner_radius_bottom_right = 14
	normal.corner_radius_bottom_left = 14
	normal.shadow_color = Color(0.158, 0.158, 0.158, 0.6)
	normal.shadow_size = 2
	normal.shadow_offset = Vector2(3, 3)
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = GOLD
	btn.add_theme_stylebox_override("normal", normal)
	btn.add_theme_stylebox_override("pressed", normal)
	btn.add_theme_stylebox_override("hover", hover)
	btn.add_theme_color_override("font_color", Color("3a2e4d"))
	btn.add_theme_color_override("font_hover_color", Color("3a2e4d"))
	btn.add_theme_color_override("font_pressed_color", Color("3a2e4d"))
	return btn


# ----------------------------------------------------------------
#  UI: one short text line + a "3 / 8" progress label. No speaker
#  icon — no recorded narration exists for this screen yet.
# ----------------------------------------------------------------
func _build_ui() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 10
	add_child(layer)

	_instruction_label = RichTextLabel.new()
	_instruction_label.bbcode_enabled = true
	_instruction_label.fit_content = true
	_instruction_label.scroll_active = false
	_instruction_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_instruction_label.add_theme_font_override("normal_font", UI_FONT)
	_instruction_label.add_theme_font_size_override("normal_font_size", 30)
	_instruction_label.add_theme_color_override("font_outline_color", Color("1d4a46"))
	_instruction_label.add_theme_constant_override("outline_size", 9)
	_instruction_label.anchor_left = 0.05
	_instruction_label.anchor_right = 0.95
	_instruction_label.anchor_top = 0.13
	_instruction_label.anchor_bottom = 0.23
	layer.add_child(_instruction_label)

	_progress_label = Label.new()
	_progress_label.text = "0 / %d" % _words_per_round
	_progress_label.add_theme_font_override("font", UI_FONT)
	_progress_label.add_theme_font_size_override("font_size", 30)
	_progress_label.add_theme_color_override("font_color", Color("2c6e68"))
	_progress_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_progress_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_progress_label.anchor_left = 0.84
	_progress_label.anchor_right = 0.98
	_progress_label.anchor_top = 0.02
	_progress_label.anchor_bottom = 0.11
	layer.add_child(_progress_label)


func _show_instruction(text: String) -> void:
	_instruction_label.text = (
		"[center][rainbow freq=0.25 sat=0.55 val=0.95]"
		+ text
		+ "[/rainbow][/center]"
	)


# ----------------------------------------------------------------
#  Sound: a light per-letter "tick" plus the shared WAV-buffer
#  "ta-da" chime for whole-word completion.
# ----------------------------------------------------------------
func _play_tick() -> void:
	var player := AudioStreamPlayer.new()
	add_child(player)
	player.stream = _tick_wave()
	player.finished.connect(player.queue_free)
	player.play()


func _tick_wave() -> AudioStreamWAV:
	var mix_rate := 22050
	var dur := 0.07
	var freq := 900.0
	var frames := int(mix_rate * dur)
	var data := PackedByteArray()
	data.resize(frames * 2)
	var byte_idx := 0
	for i in frames:
		var tt := float(i) / mix_rate
		var env := 1.0 - tt / dur
		var v := sin(TAU * freq * tt) * 0.18 * env
		data.encode_s16(byte_idx, int(clampf(v, -1.0, 1.0) * 32767.0))
		byte_idx += 2
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = mix_rate
	wav.stereo = false
	wav.data = data
	return wav


func _play_chime() -> void:
	var player := AudioStreamPlayer.new()
	add_child(player)
	player.stream = _chime_wave()
	player.finished.connect(player.queue_free)
	player.play()


# Builds the "ta-da" chime as a real WAV buffer up front instead of
# feeding an AudioStreamGenerator live from the main thread — the
# live-push API contends with the audio mixer thread, and doing that
# for several chimes at once was able to hang the whole process.
func _chime_wave() -> AudioStreamWAV:
	var mix_rate := 22050
	var notes: Array[float] = [1046.5, 1568.0]   # C6 then G6
	var note_len := 0.25
	var frames_per_note := int(mix_rate * note_len)
	var data := PackedByteArray()
	data.resize(frames_per_note * notes.size() * 2)   # 16-bit mono
	var byte_idx := 0
	for freq in notes:
		for i in frames_per_note:
			var tt := float(i) / mix_rate
			var env := 1.0 - tt / note_len
			var v := sin(TAU * freq * tt) * 0.22 * env
			data.encode_s16(byte_idx, int(clampf(v, -1.0, 1.0) * 32767.0))
			byte_idx += 2
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = mix_rate
	wav.stereo = false
	wav.data = data
	return wav
