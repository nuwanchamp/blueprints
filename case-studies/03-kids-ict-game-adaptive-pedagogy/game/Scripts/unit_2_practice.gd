# =============================================================
#  Keyboard Skills Adventure with Pip
#  UNIT 2 — PRACTICE — "Zig's Speed Round"
#  Skill: full-keyboard speed drill (replayable, no star)
#
#  DESIGN NOTE: this is not a numbered curriculum level — it has no
#  LEVEL_NUMBER and never touches StarChart. It exists because the
#  ten curriculum levels' letter pools lean heavily on the top row
#  (see Keyboard_Speed_Practice_Plan.md) — this drill instead deals
#  from a shuffled A-Z "bag" so every letter, including the
#  neglected home/bottom-row ones, gets fair, even reps.
#
#  No recorded narration exists for this screen yet — text-only for
#  now, same audio-first _say() pattern will slot in cleanly once
#  clips exist for Assets/unit2-practice/.
#
#  MECHANIC (see Keyboard_Speed_Practice_Plan.md)
#  - Falling-letter catch game, mechanically identical to Level 8
#    ("Falling Letters"): press the matching key before the letter
#    reaches Zig's basket. Never a fail — a missed letter just poofs.
#  - Runs for one fixed round (round_seconds, default 60 — see
#    Data/practice_settings.cfg) instead of a fixed catch count,
#    shown as a shrinking soft time bar (no numeric countdown).
#  - Speed ramps and the miss-mercy pause reuse Level 8's tuning.
#  - Ends with a personal-best comparison, never a loss — "Play
#    Again" restarts immediately in place.
#
#  Godot 4.x
# =============================================================
extends Node2D

const NEXT_MENU_SCENE := "res://Scenes/unit2-level-menu.tscn"

const SETTINGS_FILE_PATH := "res://Data/practice_settings.cfg"
const EXTERNAL_SETTINGS_FILENAME := "practice_settings.cfg"
const DEFAULT_ROUND_SECONDS := 60.0
const IDLE_HINT_SECONDS := 8.0

const BASE_FALL_SPEED := 70.0     # px/s for the first letter
const SPEED_PER_CATCH := 6.0      # hidden ramp
const MAX_FALL_SPEED := 140.0
const MERCY_SPEED := 42.0         # after 2 landings, this gentle speed...
const MERCY_LETTERS := 3          # ...for this many letters
const MISSES_FOR_MERCY := 2

const ALPHABET: Array[String] = [
	"A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
	"N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
]

const COL_BG   := Color("e0f7f4")   # same fresh minty pastel as Unit 2
const GOLD := Color("ffd166")
const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")
const ZIG_TEXTURE: Texture2D = preload("res://Assets/keyboard-mascot-trans.png")
const HAND_CURSOR: Texture2D = preload("res://Assets/pointer.png")

const CARD_SIZE := Vector2(90, 90)
const CARD_COLORS: Array[Color] = [
	Color("ff8fab"), Color("6b7fd7"), Color("06d6a0"), Color("f4a259"), Color("ffd166"),
]

const SAVE_PATH := "user://typing_practice.cfg"

var _round_seconds := DEFAULT_ROUND_SECONDS

var _bag: Array[String] = []
var _last_letter := ""

var _round_caught := 0
var _best := 0

var _misses := 0
var _mercy_left := 0
var _finished := false
var _falling := false             # a letter is currently in the air

var _card: Panel
var _card_letter := ""

var _zig: Sprite2D
var _basket: Panel
var _basket_layer: CanvasLayer
var _pile: Array[Panel] = []      # little caught-letter chips on the rim
var _idle_timer: Timer

var _time_bar_fill: Panel
var _time_bar_width := 0.0

var _instruction_label: RichTextLabel
var _caught_label: Label


func _ready() -> void:
	StarChart.hide_chart()
	Input.set_custom_mouse_cursor(HAND_CURSOR)
	randomize()

	_load_settings()
	_load_best()

	var bg := ColorRect.new()
	bg.color = COL_BG
	bg.anchor_right = 1.0
	bg.anchor_bottom = 1.0
	var bg_layer := CanvasLayer.new()
	bg_layer.layer = -10
	bg_layer.add_child(bg)
	add_child(bg_layer)

	_build_zig_and_basket()
	_build_ui()
	_build_time_bar()

	_idle_timer = Timer.new()
	_idle_timer.wait_time = IDLE_HINT_SECONDS
	_idle_timer.one_shot = true
	_idle_timer.timeout.connect(_on_idle_hint)
	add_child(_idle_timer)

	_show_instruction("Catch as many letters as you can! Press the right key before they land!")
	_start_time_bar()
	get_tree().create_timer(1.0).timeout.connect(_spawn_letter)


func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null)


func _screen_size() -> Vector2:
	return get_viewport_rect().size


# ----------------------------------------------------------------
#  Zig and his basket at the bottom (same as Level 8)
# ----------------------------------------------------------------
func _build_zig_and_basket() -> void:
	_basket_layer = CanvasLayer.new()
	_basket_layer.layer = 5
	add_child(_basket_layer)

	_zig = Sprite2D.new()
	_zig.texture = ZIG_TEXTURE
	_zig.scale = Vector2.ONE * (330.0 / ZIG_TEXTURE.get_width())
	_zig.position = Vector2(_screen_size().x * 0.5 - 190.0, _screen_size().y - 120.0)
	add_child(_zig)

	var basket_size := Vector2(220, 110)
	_basket = Panel.new()
	var box := StyleBoxFlat.new()
	box.bg_color = Color("c98d5a")   # woven-basket brown
	box.border_width_left = 5
	box.border_width_top = 5
	box.border_width_right = 5
	box.border_width_bottom = 5
	box.border_color = Color("8a5a33")
	box.corner_radius_top_left = 8
	box.corner_radius_top_right = 8
	box.corner_radius_bottom_right = 42
	box.corner_radius_bottom_left = 42
	box.shadow_color = Color(0.158, 0.158, 0.158, 0.5)
	box.shadow_size = 3
	box.shadow_offset = Vector2(4, 5)
	_basket.add_theme_stylebox_override("panel", box)
	_basket.position = Vector2(_screen_size().x * 0.5 - basket_size.x * 0.5,
		_screen_size().y - basket_size.y - 40.0)
	_basket.size = basket_size
	_basket_layer.add_child(_basket)


func _basket_center() -> Vector2:
	return _basket.position + _basket.size * 0.5


func _wiggle_basket() -> void:
	_basket.pivot_offset = _basket.size * 0.5
	var t := create_tween()
	t.tween_property(_basket, "rotation", 0.12, 0.08)
	t.tween_property(_basket, "rotation", -0.1, 0.1)
	t.tween_property(_basket, "rotation", 0.0, 0.1)
	t.parallel().tween_property(_basket, "scale", Vector2(1.08, 0.94), 0.1)
	t.tween_property(_basket, "scale", Vector2.ONE, 0.15)


func _add_pile_chip() -> void:
	# A small colored chip peeks over the basket rim for every catch,
	# so the child literally watches the basket fill up.
	var chip := Panel.new()
	var box := StyleBoxFlat.new()
	box.bg_color = CARD_COLORS[_pile.size() % CARD_COLORS.size()]
	box.corner_radius_top_left = 6
	box.corner_radius_top_right = 6
	box.corner_radius_bottom_right = 6
	box.corner_radius_bottom_left = 6
	box.border_width_left = 2
	box.border_width_top = 2
	box.border_width_right = 2
	box.border_width_bottom = 2
	box.border_color = Color("8a5a33")
	chip.add_theme_stylebox_override("panel", box)
	var chip_w := 22.0
	var per_row := 9
	var row := floori(float(_pile.size()) / float(per_row))
	var col := _pile.size() % per_row
	chip.position = _basket.position + Vector2(
		12.0 + col * (chip_w + 2.0),
		-14.0 - row * 14.0
	)
	chip.size = Vector2(chip_w, 18)
	_basket_layer.add_child(chip)
	_pile.append(chip)


# ----------------------------------------------------------------
#  Full-alphabet "bag" — every letter gets an even, fair turn before
#  any letter repeats, unlike a fixed hand-picked pool.
# ----------------------------------------------------------------
func _draw_letter() -> String:
	if _bag.is_empty():
		_bag = ALPHABET.duplicate()
		_bag.shuffle()
		if _bag.size() > 1 and _bag[0] == _last_letter:
			var tmp := _bag[0]
			_bag[0] = _bag[1]
			_bag[1] = tmp
	var letter: String = _bag.pop_back()
	_last_letter = letter
	return letter


# ----------------------------------------------------------------
#  Falling letters (same visuals as Level 8)
# ----------------------------------------------------------------
func _spawn_letter() -> void:
	if _finished:
		return

	var letter := _draw_letter()
	_card_letter = letter

	_card = Panel.new()
	var box := StyleBoxFlat.new()
	box.bg_color = Color(1, 1, 1, 1)
	box.border_width_left = 4
	box.border_width_top = 4
	box.border_width_right = 4
	box.border_width_bottom = 4
	box.border_color = CARD_COLORS[randi() % CARD_COLORS.size()]
	box.corner_radius_top_left = 16
	box.corner_radius_top_right = 16
	box.corner_radius_bottom_right = 16
	box.corner_radius_bottom_left = 16
	box.shadow_color = Color(0.158, 0.158, 0.158, 0.4)
	box.shadow_size = 3
	box.shadow_offset = Vector2(3, 4)
	_card.add_theme_stylebox_override("panel", box)
	var s := _screen_size()
	_card.position = Vector2(randf_range(s.x * 0.15, s.x * 0.85 - CARD_SIZE.x), -CARD_SIZE.y)
	_card.size = CARD_SIZE
	_basket_layer.add_child(_card)

	var label := Label.new()
	label.text = letter
	# Plain default font on purpose — must match physical key glyphs.
	label.add_theme_font_size_override("font_size", 48)
	label.add_theme_color_override("font_color", Color("2c6e68"))
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.anchor_right = 1.0
	label.anchor_bottom = 1.0
	_card.add_child(label)

	# Gentle sway while falling, so it drifts rather than plummets.
	var sway := create_tween().set_loops()
	var home_x := _card.position.x
	sway.tween_property(_card, "position:x", home_x + 26.0, 0.9)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	sway.tween_property(_card, "position:x", home_x - 26.0, 1.8)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	sway.tween_property(_card, "position:x", home_x, 0.9)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	# The card gets freed (caught, landed, or the round ends) while this
	# loop is still running — keep the tween so it can be killed first,
	# otherwise the infinite loop keeps stepping against a freed node.
	_card.set_meta("sway_tween", sway)

	_falling = true
	_idle_timer.start()


func _current_speed() -> float:
	if _mercy_left > 0:
		return MERCY_SPEED
	return minf(BASE_FALL_SPEED + SPEED_PER_CATCH * _round_caught, MAX_FALL_SPEED)


func _process(delta: float) -> void:
	if _finished or not _falling or _card == null:
		return
	_card.position.y += _current_speed() * delta
	if _card.position.y >= _screen_size().y - 190.0:
		_on_letter_landed()


func _on_letter_landed() -> void:
	_falling = false
	_idle_timer.stop()
	var card := _card
	_card = null
	(card.get_meta("sway_tween") as Tween).kill()

	# Landing is soft: the letter just poofs, no sad sound, no penalty.
	var t := create_tween()
	t.tween_property(card, "scale", Vector2(1.3, 0.5), 0.15)
	t.parallel().tween_property(card, "modulate:a", 0.0, 0.3)
	t.tween_callback(card.queue_free)

	_misses += 1
	if _misses >= MISSES_FOR_MERCY and _mercy_left <= 0:
		_misses = 0
		_mercy_left = MERCY_LETTERS
		_show_instruction("Take your time! The letters will float down slowly for a bit.")
	else:
		_show_instruction("So close! Here comes another one!")

	if not _finished:
		get_tree().create_timer(1.0).timeout.connect(_spawn_letter)


# ----------------------------------------------------------------
#  Input
# ----------------------------------------------------------------
func _input(event: InputEvent) -> void:
	if _finished or not _falling or _card == null or not (event is InputEventKey):
		return
	var key := event as InputEventKey
	if not key.pressed or key.echo:
		return
	_idle_timer.start()

	var pressed := OS.get_keycode_string(key.keycode).to_upper()
	if pressed == _card_letter:
		_catch_letter()
	elif pressed.length() == 1 and pressed >= "A" and pressed <= "Z":
		# Wrong letter: the falling card wobbles kindly; no penalty.
		var home_rot := _card.rotation
		var t := create_tween()
		t.tween_property(_card, "rotation", home_rot + 0.15, 0.06)
		t.tween_property(_card, "rotation", home_rot - 0.15, 0.06)
		t.tween_property(_card, "rotation", home_rot, 0.06)
		_show_instruction("Almost — that one is the letter %s!" % _card_letter)
	# Non-letter keys are silently ignored.


func _catch_letter() -> void:
	_falling = false
	_idle_timer.stop()
	if _mercy_left > 0:
		_mercy_left -= 1
	_round_caught += 1
	_caught_label.text = str(_round_caught)

	var card := _card
	_card = null
	(card.get_meta("sway_tween") as Tween).kill()
	_play_chime()
	Confetti.rain(10, 0.2, Vector2(card.position.x, card.position.x + CARD_SIZE.x))

	# The letter dives happily into the basket.
	card.pivot_offset = CARD_SIZE * 0.5
	var t := create_tween()
	t.tween_property(card, "position", _basket_center() - CARD_SIZE * 0.5, 0.4)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	t.parallel().tween_property(card, "scale", Vector2.ONE * 0.25, 0.4)
	t.parallel().tween_property(card, "rotation", 0.6, 0.4)
	t.tween_callback(card.queue_free)
	t.tween_callback(_wiggle_basket)
	t.tween_callback(_add_pile_chip)

	if not _finished:
		if _round_caught % 5 == 0:
			_show_instruction("%d letters so far! Keep going!" % _round_caught)
		get_tree().create_timer(0.85).timeout.connect(_spawn_letter)


# ----------------------------------------------------------------
#  Idle hint: flash the falling letter and name it out loud.
# ----------------------------------------------------------------
func _on_idle_hint() -> void:
	if _finished or not _falling or _card == null:
		return
	_show_instruction("Press the letter %s before it lands!" % _card_letter)
	var box := _card.get_theme_stylebox("panel") as StyleBoxFlat
	var t := create_tween()
	for i in 3:
		t.tween_method(func (c: Color) -> void: box.bg_color = c,
			Color(1, 1, 1), GOLD, 0.25).set_trans(Tween.TRANS_SINE)
		t.tween_method(func (c: Color) -> void: box.bg_color = c,
			GOLD, Color(1, 1, 1), 0.25).set_trans(Tween.TRANS_SINE)
	_idle_timer.start()


# ----------------------------------------------------------------
#  Soft round timer: a shrinking bar instead of a numeric countdown.
# ----------------------------------------------------------------
func _build_time_bar() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 10
	add_child(layer)

	_time_bar_width = _screen_size().x * 0.5

	var track := Panel.new()
	var track_box := StyleBoxFlat.new()
	track_box.bg_color = Color(1, 1, 1, 0.6)
	track_box.corner_radius_top_left = 10
	track_box.corner_radius_top_right = 10
	track_box.corner_radius_bottom_right = 10
	track_box.corner_radius_bottom_left = 10
	track.add_theme_stylebox_override("panel", track_box)
	track.position = Vector2(_screen_size().x * 0.5 - _time_bar_width * 0.5, 28.0)
	track.size = Vector2(_time_bar_width, 18.0)
	layer.add_child(track)

	_time_bar_fill = Panel.new()
	var fill_box := StyleBoxFlat.new()
	fill_box.bg_color = GOLD
	fill_box.corner_radius_top_left = 10
	fill_box.corner_radius_top_right = 10
	fill_box.corner_radius_bottom_right = 10
	fill_box.corner_radius_bottom_left = 10
	_time_bar_fill.add_theme_stylebox_override("panel", fill_box)
	_time_bar_fill.position = track.position
	_time_bar_fill.size = Vector2(_time_bar_width, 18.0)
	layer.add_child(_time_bar_fill)


func _start_time_bar() -> void:
	var t := create_tween()
	t.tween_property(_time_bar_fill, "size:x", 0.0, _round_seconds)
	t.finished.connect(_on_round_finished)


# ----------------------------------------------------------------
#  End of round: always warm, never a loss.
# ----------------------------------------------------------------
func _on_round_finished() -> void:
	if _finished:
		return
	_finished = true
	_idle_timer.stop()

	if _card:
		(_card.get_meta("sway_tween") as Tween).kill()
		var c := _card
		_card = null
		var t := create_tween()
		t.tween_property(c, "modulate:a", 0.0, 0.25)
		t.tween_callback(c.queue_free)

	var beat_best := _round_caught > _best
	if beat_best:
		_best = _round_caught
		_save_best()

	Confetti.rain()
	_wiggle_basket()
	if beat_best:
		_show_instruction("New personal best — %d letters! Amazing speed!" % _round_caught)
	else:
		_show_instruction("Great practice! You found %d letters. Best so far: %d." % [_round_caught, _best])

	get_tree().create_timer(1.4).timeout.connect(func () -> void: _show_summary(beat_best))


func _show_summary(beat_best: bool) -> void:
	var layer := CanvasLayer.new()
	layer.layer = 20
	add_child(layer)

	var panel_size := Vector2(560, 380)
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
	title.anchor_top = 0.08
	title.anchor_bottom = 0.24
	title.text = (
		"[center][rainbow freq=0.25 sat=0.55 val=0.95]"
		+ ("New Personal Best! 🎉" if beat_best else "Great Practice!")
		+ "[/rainbow][/center]"
	)
	panel.add_child(title)

	var stats := Label.new()
	stats.text = "You found %d letters in %s!\nBest round: %d letters" % [_round_caught, _duration_text(), _best]
	stats.add_theme_font_size_override("font_size", 24)
	stats.add_theme_color_override("font_color", Color("2c6e68"))
	stats.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	stats.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	stats.autowrap_mode = TextServer.AUTOWRAP_WORD
	stats.anchor_left = 0.08
	stats.anchor_right = 0.92
	stats.anchor_top = 0.32
	stats.anchor_bottom = 0.5
	panel.add_child(stats)

	var again_btn := _make_summary_button("🔄  Play Again", Vector2(0.5, 0.62))
	again_btn.pressed.connect(func () -> void: get_tree().reload_current_scene())
	panel.add_child(again_btn)

	var menu_btn := _make_summary_button("📋  Level Menu", Vector2(0.5, 0.78))
	menu_btn.pressed.connect(func () -> void: get_tree().change_scene_to_file(NEXT_MENU_SCENE))
	panel.add_child(menu_btn)


func _make_summary_button(text: String, anchor: Vector2) -> Button:
	var btn := Button.new()
	btn.text = text
	btn.add_theme_font_override("font", UI_FONT)
	btn.add_theme_font_size_override("font_size", 26)
	btn.anchor_left = anchor.x
	btn.anchor_right = anchor.x
	btn.anchor_top = anchor.y
	btn.anchor_bottom = anchor.y
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
#  UI: one short text line + a live caught-count (no speaker icon —
#  no recorded narration exists for this screen yet; text-only).
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

	_caught_label = Label.new()
	_caught_label.text = "0"
	_caught_label.add_theme_font_override("font", UI_FONT)
	_caught_label.add_theme_font_size_override("font_size", 40)
	_caught_label.add_theme_color_override("font_color", Color("2c6e68"))
	_caught_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_caught_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_caught_label.anchor_left = 0.0
	_caught_label.anchor_right = 0.14
	_caught_label.anchor_top = 0.02
	_caught_label.anchor_bottom = 0.12
	layer.add_child(_caught_label)


func _show_instruction(text: String) -> void:
	_instruction_label.text = (
		"[center][rainbow freq=0.25 sat=0.55 val=0.95]"
		+ text
		+ "[/rainbow][/center]"
	)


# ----------------------------------------------------------------
#  Settings (round length) — same external-file-first, then bundled,
#  lookup as Word Train's word list, so it's editable post-ship
#  without a rebuild. See Data/practice_settings.cfg.
# ----------------------------------------------------------------
func _load_settings() -> void:
	var external_path := OS.get_executable_path().get_base_dir().path_join(EXTERNAL_SETTINGS_FILENAME)
	var path := external_path if FileAccess.file_exists(external_path) else SETTINGS_FILE_PATH
	var cfg := ConfigFile.new()
	if cfg.load(path) != OK:
		return
	var value: float = cfg.get_value("speed_round", "round_seconds", _round_seconds)
	_round_seconds = maxf(10.0, value)


## A friendly "X seconds" / "X minutes" phrase for the round length,
## since it's no longer always exactly one minute.
func _duration_text() -> String:
	if int(_round_seconds) % 60 == 0:
		var mins := int(_round_seconds) / 60
		return "%d minute%s" % [mins, "" if mins == 1 else "s"]
	return "%d seconds" % int(_round_seconds)


# ----------------------------------------------------------------
#  Personal-best persistence (same ConfigFile technique as
#  Scripts/star_chart.gd's _save()/_load(), different file/keys).
# ----------------------------------------------------------------
func _load_best() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(SAVE_PATH) != OK:
		return
	_best = cfg.get_value("practice", "best_caught", 0)


func _save_best() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("practice", "best_caught", _best)
	cfg.save(SAVE_PATH)


# ----------------------------------------------------------------
#  Chime (generated, zero assets)
# ----------------------------------------------------------------
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
