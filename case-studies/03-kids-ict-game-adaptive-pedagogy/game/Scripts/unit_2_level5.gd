# =============================================================
#  Keyboard Skills Adventure with Pip
#  UNIT 2 — LEVEL 5 — "Steer the Bunny"  (prototype)
#  Skill: arrow keys — controlled, continuous movement
#
#  PROTOTYPE NOTE: narration uses the recorded voice clips in
#  Assets/unit2-level5/, same audio-first pattern as Levels 1–4
#  (see _say()). The bunny from Unit 1 (its walk-cycle art already
#  in the project) stands in as the steerable character here, and
#  the collectibles are real carrots instead of procedural stars;
#  only the arrow-key cluster stays procedural.
#
#  MECHANIC (per Keyboard_Skills_Adventure_Level_Plan.md)
#  - The bunny stands on an open field with carrots scattered around.
#  - The four arrow keys steer it; HOLDING a key moves it
#    continuously — that is the skill being taught.
#  - Touching a carrot collects it: chime + confetti pop.
#  - No walls, no fails: the bunny just stops gently at screen edges.
#  - 3 rounds with more carrots each time (3 -> 4 -> 5).
#  - An arrow-key cluster at the bottom lights up as keys are
#    pressed, mirroring the on-screen keyboard of levels 1–4.
#
#  Godot 4.x
# =============================================================
extends Node2D

signal level_completed(level_number: int)

const LEVEL_NUMBER := 14   # StarChart badge slot (Unit 2 starts at 11)
const NEXT_SCENE := "res://Scenes/unit2-level6.tscn"   # placeholder — level 6 not built yet

const IDLE_HINT_SECONDS := 8.0
const MOVE_SPEED := 320.0
const COLLECT_RADIUS := 60.0
const ROUND_CARROT_COUNTS := [3, 4, 5]

const COL_BG   := Color("e0f7f4")   # same fresh minty pastel as levels 1–4
const GOLD := Color("ffd166")
const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")
const BUNNY_SCENE: PackedScene = preload("res://Scenes/bunny-walk.tscn")
const BUNNY_IDLE_TEXTURE: Texture2D = preload("res://Assets/bunny/Bunny-Idle.png")   # only used for on-screen sizing math
const BUNNY_HEIGHT := 150.0   # on-screen height in px
const CARROT_TEXTURE: Texture2D = preload("res://Assets/unit1-level10/bunny-eat-carrot/currot.png")
const CARROT_HEIGHT := 64.0   # on-screen height in px
const HAND_CURSOR: Texture2D = preload("res://Assets/pointer.png")

const ARROW_KEYS := [KEY_UP, KEY_LEFT, KEY_DOWN, KEY_RIGHT]

# --- Recorded narration clips ---
const VOICE_USE_ARROW_KEYS: AudioStream = preload("res://Assets/unit2-level5/use-arrow-keys.mp3")
const VOICE_MORE_CARROTS: AudioStream = preload("res://Assets/unit2-level5/more-carrots.mp3")
const VOICE_WHAT_A_HOPPER: AudioStream = preload("res://Assets/unit2-level5/what-a-hopper.mp3")

var _round := 0
var _carrots: Array[Node2D] = []
var _finished := false

var _bunny: Node2D
var _bunny_anim: AnimatedSprite2D
var _arrow_panels: Dictionary = {}   # keycode -> {panel: Panel, box: StyleBoxFlat}
var _idle_timer: Timer
var _instruction_label: RichTextLabel
var _speaker_btn: Button
var _voice: AudioStreamPlayer   # plays the recorded narration clips
var _current_instruction := "Use the arrow keys to steer the bunny around! Let's collect some carrots!"
var _current_clip: AudioStream = VOICE_USE_ARROW_KEYS


func _ready() -> void:
	StarChart.hide_chart()
	Input.set_custom_mouse_cursor(HAND_CURSOR)
	randomize()

	var bg := ColorRect.new()
	bg.color = COL_BG
	bg.anchor_right = 1.0
	bg.anchor_bottom = 1.0
	var bg_layer := CanvasLayer.new()
	bg_layer.layer = -10
	bg_layer.add_child(bg)
	add_child(bg_layer)

	_build_bunny()
	_build_arrow_cluster()
	_build_ui()

	_idle_timer = Timer.new()
	_idle_timer.wait_time = IDLE_HINT_SECONDS
	_idle_timer.one_shot = true
	_idle_timer.timeout.connect(_on_idle_hint)
	add_child(_idle_timer)
	_idle_timer.start()

	_voice = AudioStreamPlayer.new()
	add_child(_voice)

	_say(VOICE_USE_ARROW_KEYS, "Use the arrow keys to steer the bunny around! Let's collect some carrots!")
	_start_round(0)


func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null)


func _screen_size() -> Vector2:
	return get_viewport_rect().size


# ----------------------------------------------------------------
#  The bunny: steered every frame while arrow keys are held.
# ----------------------------------------------------------------
func _build_bunny() -> void:
	_bunny = BUNNY_SCENE.instantiate()
	_bunny_anim = _bunny.get_node("AnimatedSprite2D") as AnimatedSprite2D
	_bunny_anim.animation = "idle"
	_bunny_anim.play()
	_bunny.scale = Vector2.ONE * (BUNNY_HEIGHT / BUNNY_IDLE_TEXTURE.get_height())
	_bunny.position = _screen_size() * 0.5
	add_child(_bunny)


func _set_bunny_walking(walking: bool) -> void:
	var target := "walking" if walking else "idle"
	if _bunny_anim.animation != target:
		_bunny_anim.animation = target
		_bunny_anim.play()


func _process(delta: float) -> void:
	if _finished:
		return

	var dir := Vector2.ZERO
	if Input.is_physical_key_pressed(KEY_UP):
		dir.y -= 1.0
	if Input.is_physical_key_pressed(KEY_DOWN):
		dir.y += 1.0
	if Input.is_physical_key_pressed(KEY_LEFT):
		dir.x -= 1.0
	if Input.is_physical_key_pressed(KEY_RIGHT):
		dir.x += 1.0

	_update_arrow_cluster()

	if dir == Vector2.ZERO:
		_set_bunny_walking(false)
		return
	_idle_timer.start()
	_set_bunny_walking(true)

	_bunny.position += dir.normalized() * MOVE_SPEED * delta
	# No walls, no fails — the bunny just stops gently at the screen edge.
	var s := _screen_size()
	_bunny.position = _bunny.position.clamp(Vector2(60, 60), s - Vector2(60, 120))
	# Face the way it's hopping.
	if dir.x != 0.0:
		_bunny_anim.flip_h = dir.x < 0.0

	_check_carrot_pickup()


# ----------------------------------------------------------------
#  Carrots (real art, borrowed from Unit 1's bunny finale)
# ----------------------------------------------------------------
func _start_round(r: int) -> void:
	_round = r
	for carrot in _carrots:
		carrot.queue_free()
	_carrots.clear()

	var count: int = ROUND_CARROT_COUNTS[r]
	var s := _screen_size()
	for i in count:
		var pos := Vector2(
			randf_range(s.x * 0.12, s.x * 0.88),
			randf_range(s.y * 0.15, s.y * 0.7)
		)
		# Keep carrots off the bunny's spawn so nothing is collected for free.
		if pos.distance_to(_bunny.position) < COLLECT_RADIUS * 2.5:
			pos.x = s.x * 0.15 if pos.x > s.x * 0.5 else s.x * 0.85
		_carrots.append(_spawn_carrot(pos))


func _spawn_carrot(pos: Vector2) -> Node2D:
	var carrot := Sprite2D.new()
	carrot.texture = CARROT_TEXTURE
	carrot.scale = Vector2.ONE * (CARROT_HEIGHT / CARROT_TEXTURE.get_height())
	carrot.position = pos
	add_child(carrot)

	# Gentle twinkle so the goals feel alive.
	var base_scale := carrot.scale
	var t := create_tween().set_loops()
	t.tween_property(carrot, "scale", base_scale * 1.12, 0.6).set_trans(Tween.TRANS_SINE)
	t.tween_property(carrot, "scale", base_scale, 0.6).set_trans(Tween.TRANS_SINE)
	# Collecting the carrot frees it while this loop is still running —
	# keep the tween so _collect_carrot() can kill it first, otherwise
	# the infinite loop keeps stepping against a freed node.
	carrot.set_meta("twinkle_tween", t)
	return carrot


func _check_carrot_pickup() -> void:
	for carrot in _carrots:
		if carrot.position.distance_to(_bunny.position) <= COLLECT_RADIUS:
			_collect_carrot(carrot)
			break


func _collect_carrot(carrot: Node2D) -> void:
	_carrots.erase(carrot)
	(carrot.get_meta("twinkle_tween") as Tween).kill()
	_play_chime()
	Confetti.rain(14, 0.25, Vector2(carrot.position.x - 60.0, carrot.position.x + 60.0))

	# Pop out, then free.
	var t := create_tween()
	t.tween_property(carrot, "scale", (carrot as Sprite2D).scale * 1.6, 0.15)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	t.parallel().tween_property(carrot, "modulate:a", 0.0, 0.2)
	t.tween_callback(carrot.queue_free)

	if _carrots.is_empty():
		if _round < ROUND_CARROT_COUNTS.size() - 1:
			_say(VOICE_MORE_CARROTS, "You got them all! Here come more carrots!")
			get_tree().create_timer(1.2).timeout.connect(
				func () -> void:
					if not _finished:
						_start_round(_round + 1)
			)
		else:
			_on_level_finished()


# ----------------------------------------------------------------
#  On-screen arrow-key cluster (bottom centre) that lights up as
#  the real keys are held — this level's "on-screen keyboard".
# ----------------------------------------------------------------
func _build_arrow_cluster() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 5
	add_child(layer)

	var key_size := Vector2(56, 56)
	var gap := 8.0
	var s := _screen_size()
	var base := Vector2(s.x * 0.5, s.y - 90.0)
	var arrows := {
		KEY_UP: {"glyph": "▲", "offset": Vector2(0, -(key_size.y + gap))},
		KEY_LEFT: {"glyph": "◀", "offset": Vector2(-(key_size.x + gap), 0)},
		KEY_DOWN: {"glyph": "▼", "offset": Vector2.ZERO},
		KEY_RIGHT: {"glyph": "▶", "offset": Vector2(key_size.x + gap, 0)},
	}

	for keycode: int in arrows:
		var info: Dictionary = arrows[keycode]
		var key := Panel.new()
		var box := StyleBoxFlat.new()
		box.bg_color = Color(1, 1, 1, 1)
		box.border_width_left = 3
		box.border_width_top = 3
		box.border_width_right = 3
		box.border_width_bottom = 3
		box.border_color = Color("2c6e68")
		box.corner_radius_top_left = 10
		box.corner_radius_top_right = 10
		box.corner_radius_bottom_right = 10
		box.corner_radius_bottom_left = 10
		box.shadow_color = Color(0.158, 0.158, 0.158, 0.4)
		box.shadow_size = 2
		box.shadow_offset = Vector2(2, 3)
		key.add_theme_stylebox_override("panel", box)
		key.position = base + (info["offset"] as Vector2) - key_size * 0.5
		key.size = key_size
		layer.add_child(key)

		var label := Label.new()
		label.text = info["glyph"]
		label.add_theme_font_size_override("font_size", 24)
		label.add_theme_color_override("font_color", Color("2c6e68"))
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		label.anchor_right = 1.0
		label.anchor_bottom = 1.0
		key.add_child(label)

		_arrow_panels[keycode] = {"panel": key, "box": box}


func _update_arrow_cluster() -> void:
	for keycode: int in _arrow_panels:
		var box: StyleBoxFlat = (_arrow_panels[keycode] as Dictionary)["box"]
		box.bg_color = GOLD if Input.is_physical_key_pressed(keycode) else Color(1, 1, 1, 1)


# ----------------------------------------------------------------
#  Idle hint: pulse the arrow cluster and repeat the line.
# ----------------------------------------------------------------
func _on_idle_hint() -> void:
	if _finished:
		return
	_say(_current_clip, _current_instruction)
	for keycode: int in _arrow_panels:
		var box: StyleBoxFlat = (_arrow_panels[keycode] as Dictionary)["box"]
		var t := create_tween()
		t.tween_method(func (c: Color) -> void: box.bg_color = c,
			Color(1, 1, 1), GOLD, 0.3).set_trans(Tween.TRANS_SINE)
		t.tween_method(func (c: Color) -> void: box.bg_color = c,
			GOLD, Color(1, 1, 1), 0.3).set_trans(Tween.TRANS_SINE)
	_idle_timer.start()


# ----------------------------------------------------------------
#  Finish
# ----------------------------------------------------------------
func _on_level_finished() -> void:
	_finished = true
	_idle_timer.stop()
	Confetti.rain()
	StarChart.show_chart(StarChart.UNIT_2_LEVELS)
	StarChart.add_star(LEVEL_NUMBER)
	_say(VOICE_WHAT_A_HOPPER, "What a hopper! You collected every carrot!")
	get_tree().create_timer(2.5).timeout.connect(_on_celebration_finished)


func _on_celebration_finished() -> void:
	level_completed.emit(LEVEL_NUMBER)
	var err := get_tree().change_scene_to_file(NEXT_SCENE)
	if err != OK:
		# Level 6 doesn't exist yet in this prototype — stay put instead
		# of crashing, and start the carrot hunt over.
		_finished = false
		_idle_timer.start()
		_say(VOICE_USE_ARROW_KEYS, "Use the arrow keys to steer the bunny around! Let's collect some carrots!")
		_start_round(0)


# ----------------------------------------------------------------
#  UI: one short text line + speaker button (same pattern as 1–4)
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
	_instruction_label.add_theme_font_size_override("normal_font_size", 34)
	_instruction_label.add_theme_color_override("font_outline_color", Color("1d4a46"))
	_instruction_label.add_theme_constant_override("outline_size", 10)
	_instruction_label.anchor_left = 0.05
	_instruction_label.anchor_right = 0.95
	_instruction_label.anchor_top = 0.1
	_instruction_label.anchor_bottom = 0.2
	layer.add_child(_instruction_label)

	_speaker_btn = Button.new()
	_speaker_btn.text = "🔊"
	_speaker_btn.add_theme_font_size_override("font_size", 30)
	_speaker_btn.anchor_left = 0.0
	_speaker_btn.anchor_top = 1.0
	_speaker_btn.offset_left = 16
	_speaker_btn.offset_top = -76
	_speaker_btn.offset_right = 76
	_speaker_btn.offset_bottom = -16
	_speaker_btn.pressed.connect(func () -> void: _say(_current_clip, _current_instruction))
	layer.add_child(_speaker_btn)


# ----------------------------------------------------------------
#  Narration: recorded voice clips (audio-first), text line synced
# ----------------------------------------------------------------
func _say(clip: AudioStream, text: String) -> void:
	_current_instruction = text
	_current_clip = clip
	_instruction_label.text = (
		"[center][rainbow freq=0.25 sat=0.55 val=0.95]"
		+ text
		+ "[/rainbow][/center]"
	)
	_voice.stop()               # never overlap two voice lines
	_voice.stream = clip
	_voice.play()


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
# for several chimes/voice lines at once (e.g. right after finishing
# a level, when this and StarChart's own chime can overlap) was able
# to hang the whole process.
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
