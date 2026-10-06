# =============================================================
#  Mouse Skills Adventure with Pip
#  LEVEL 10 — Tidy Up with Pip  (FINAL LEVEL)
#  Skill: drag and drop — press, HOLD, move, release
#
#  HOW TO USE
#  1. New scene with a plain Node2D root.
#  2. Attach this script. Save as level_10_tidy_up.tscn.
#  3. Run the scene (F6) to test it standalone.
#
#  MECHANIC
#  - Round 1: three carrots are scattered on the right; the bunny
#    (Bunny-eats.tscn) waits on the left.
#  - Press the left button on a carrot to grab it. While held,
#    it wobbles happily and a dotted line points to the bunny.
#  - Releasing early just drops it where it is — "Oops, it
#    slipped! Grab it again!" — no reset, no penalty.
#  - Dropping on (or near) the bunny delivers it: the bunny chomps.
#  - BONUS round: all five toys (reused from level 7) into the toy
#    box, with slightly smaller pickup targets and a slightly
#    smaller drop zone.
#  - When everything is tidy the bunny eats once more, and the
#    FINAL star is awarded.
#
#  INTEGRATION
#  - Emits `level_completed(10)`; calls StarChart.add_star(10), then
#    transitions to the Unit 1 results screen. _say() plays the
#    recorded narration clips.
#
#  Godot 4.x
# =============================================================
extends Node2D

signal level_completed(level_number: int)

const LEVEL_NUMBER := 10
const IDLE_HINT_SECONDS := 8.0

const COL_BG   := Color("fdeedc")   # cosy kitchen cream

# --- Custom display font, same as the other levels ---
const UI_FONT: FontFile = preload("res://Assets/Coiny-Regular.ttf")

# --- Custom cursor, same on every screen ---
const HAND_CURSOR: Texture2D = preload("res://Assets/pointer.png")

# Round tuning: pickup radius and drop-zone radius shrink a
# little in the bonus round (hidden precision training).
const PICK_RADIUS: Array[float] = [60.0, 48.0]
const DROP_RADIUS: Array[float] = [110.0, 90.0]

# --- Recorded voice clips ---
const VOICE_HUNGRY: AudioStream    = preload("res://Assets/unit1-level10/bunny-hungry.mp3")
const VOICE_PRESS: AudioStream     = preload("res://Assets/unit1-level10/press-the button.mp3")
const VOICE_BONUS: AudioStream     = preload("res://Assets/unit1-level10/bonus.mp3")
const VOICE_DRAG_TOYS: AudioStream = preload("res://Assets/unit1-level10/drag-toys.mp3")
const VOICE_YUMYUM: AudioStream    = preload("res://Assets/unit1-level10/yumyum.mp3")
const VOICE_ALL_TIDY: AudioStream  = preload("res://Assets/unit1-level10/all-tidy.mp3")
const VOICE_SLIPED: AudioStream  = preload("res://Assets/unit1-level10/it-slipped.mp3")
const VOICE_IN_IT_GOES: AudioStream  = preload("res://Assets/unit1-level10/in-it-goes.mp3")

# --- Art: the bunny companion + carrot (round 0), toy box + toys (bonus) ---
const BUNNY_SCENE := preload("res://Scenes/unit1-level-10/Bunny-eats.tscn")
const ANIM_WAITING := "waiting"
const ANIM_EATING := "eating"
const BUNNY_HEIGHT := 220.0        # on-screen height in px

const CARROT_TEXTURE: Texture2D = preload("res://Assets/unit1-level10/bunny-eat-carrot/currot.png")
const CARROT_HEIGHT := 90.0        # on-screen height in px

const TOYBOX_TEXTURE: Texture2D = preload("res://Assets/unit1-level10/toy-box-tidy/toybox.png")
const TOYBOX_HEIGHT := 100.0       # on-screen height in px — small enough that the bunny peeks over it

# Reusing the toy art from the Bubble Pop Party level (unit_1_level_7).
const TOY_TEXTURES: Array[Texture2D] = [
	preload("res://Assets/unit1-level7/toys_03.png"),
	preload("res://Assets/unit1-level7/toys_05.png"),
	preload("res://Assets/unit1-level7/toys_07.png"),
	preload("res://Assets/unit1-level7/toys_10.png"),
	preload("res://Assets/unit1-level7/toys_13.png"),
]
const TOY_HEIGHT := 64.0           # on-screen height in px

# How many items to tidy up each round: 3 carrots, then all 5 toys.
const ROUND_ITEM_COUNTS: Array[int] = [3, 5]

var _round := 0                  # 0 = cheese, 1 = bonus toys
var _items: Array[Dictionary] = []   # {node, home, delivered}
var _delivered := 0
var _dragging := -1              # index into _items, -1 = none
var _drag_offset := Vector2.ZERO
var _finished := false

var _target: Node2D              # toy box (round 0 has no separate target)
var _pip: Node2D                 # Bunny-eats scene instance
var _pip_sprite: AnimatedSprite2D
var _guide: Line2D               # dotted line item -> target
var _wobble_tween: Tween

var _idle_timer: Timer
var _voice: AudioStreamPlayer   # plays the recorded narration clips
var _ghost: Node2D
var _instruction_label: RichTextLabel
var _speaker_btn: Button
var _current_instruction := "Press the button, HOLD it, drag the carrot to the bunny, then let go!"
var _current_voice: AudioStream = VOICE_PRESS
var _hand_cursor_on := false


# ----------------------------------------------------------------
#  Setup
# ----------------------------------------------------------------
func _ready() -> void:
	StarChart.hide_chart()
	Input.set_custom_mouse_cursor(HAND_CURSOR, Input.CURSOR_ARROW)
	Input.set_custom_mouse_cursor(HAND_CURSOR, Input.CURSOR_POINTING_HAND)
	Input.set_custom_mouse_cursor(HAND_CURSOR, Input.CURSOR_DRAG)

	randomize()
	var bg := ColorRect.new()
	bg.color = COL_BG
	bg.anchor_right = 1.0
	bg.anchor_bottom = 1.0
	var bg_layer := CanvasLayer.new()
	bg_layer.layer = -10
	bg_layer.add_child(bg)
	add_child(bg_layer)

	_guide = Line2D.new()
	_guide.width = 4.0
	_guide.default_color = Color(0.55, 0.45, 0.25, 0.6)
	_guide.visible = false
	add_child(_guide)

	_build_ui()
	_build_ghost_cursor()

	_idle_timer = Timer.new()
	_idle_timer.wait_time = IDLE_HINT_SECONDS
	_idle_timer.one_shot = true
	_idle_timer.timeout.connect(_on_idle_hint)
	add_child(_idle_timer)

	_voice = AudioStreamPlayer.new()
	add_child(_voice)

	_say_sequence(VOICE_HUNGRY, VOICE_PRESS,
		"Pip is hungry! Press the button, HOLD it, drag the carrot to the bunny, then let go!")
	_start_round(0)


func _exit_tree() -> void:
	Input.set_custom_mouse_cursor(null, Input.CURSOR_ARROW)
	Input.set_custom_mouse_cursor(null, Input.CURSOR_POINTING_HAND)
	Input.set_custom_mouse_cursor(null, Input.CURSOR_DRAG)


func _screen_size() -> Vector2:
	return get_viewport_rect().size


func _target_pos(r: int) -> Vector2:
	var s := _screen_size()
	if r == 0:
		return Vector2(180.0, s.y * 0.55)          # the bunny sits on the LEFT
	return Vector2(s.x - 180.0, s.y * 0.55)        # the toy box stays on the right


func _item_spawn_x_range(r: int) -> Vector2:
	var s := _screen_size()
	if r == 0:
		# Bunny is on the left; carrots scatter on the right half.
		return Vector2(s.x * 0.55, s.x - 120.0)
	# Toy box is on the right; toys scatter on the left half.
	return Vector2(120.0, s.x * 0.45)


# ----------------------------------------------------------------
#  Rounds
# ----------------------------------------------------------------
func _start_round(r: int) -> void:
	_round = r
	_delivered = 0
	_dragging = -1
	for it in _items:
		if is_instance_valid(it["node"]):
			(it["node"] as Node2D).queue_free()
	_items.clear()
	if _target and is_instance_valid(_target):
		_target.queue_free()
	if _pip and is_instance_valid(_pip):
		_pip.queue_free()

	var target_pos := _target_pos(r)
	# How far the bunny stands to the right of the box, in round 1.
	var pip_offset := Vector2(30.0, -10.0)
	# Sit the box's bottom edge right at the bunny's feet.
	var bunny_feet_y := pip_offset.y + BUNNY_HEIGHT * 0.5
	var box_offset := Vector2(0.0, bunny_feet_y - TOYBOX_HEIGHT * 0.5)

	_target = _build_target(r)
	_target.position = target_pos if r == 0 else target_pos + box_offset
	add_child(_target)

	_pip = _build_pip(r)
	if r == 0:
		# The bunny itself is the drop target, no offset needed.
		_pip.position = target_pos
		_pip.z_index = 0
	else:
		# The bunny peeks out from just behind the toy box, facing left.
		_pip.position = target_pos + pip_offset
		_pip.z_index = -1
	add_child(_pip)

	var s := _screen_size()
	var x_range := _item_spawn_x_range(r)
	for k in ROUND_ITEM_COUNTS[r]:
		var item := _build_item(r, k)
		var home := Vector2(
			randf_range(x_range.x, x_range.y),
			randf_range(s.y * 0.3, s.y - 120.0)
		)
		item.position = home
		add_child(item)
		_items.append({"node": item, "home": home, "delivered": false})

	_idle_timer.start()
	if r == 1:
		_current_instruction = "Now drag the toys into the toy box!"
		_current_voice = VOICE_DRAG_TOYS
		_say_sequence(VOICE_BONUS, VOICE_DRAG_TOYS,
			"Bonus! Now tidy the toys — drag them into the toy box!")


func _build_target(r: int) -> Node2D:
	var t := Node2D.new()
	if r == 1:
		# Toy box. (Round 0 has no separate target — the bunny IS the target.)
		var box := Sprite2D.new()
		box.texture = TOYBOX_TEXTURE
		box.centered = true
		var ts := TOYBOX_TEXTURE.get_size()
		box.scale = Vector2.ONE * (TOYBOX_HEIGHT / ts.y)
		t.add_child(box)
	return t


func _build_item(r: int, k: int) -> Node2D:
	if r == 0:
		return _build_carrot()
	return _build_toy(k)


func _build_carrot() -> Node2D:
	var c := Node2D.new()
	var spr := Sprite2D.new()
	spr.texture = CARROT_TEXTURE
	spr.centered = true
	var ts := CARROT_TEXTURE.get_size()
	spr.scale = Vector2.ONE * (CARROT_HEIGHT / ts.y)
	c.add_child(spr)
	c.rotation_degrees = randf_range(-15.0, 15.0)   # a little variety
	return c


func _build_toy(k: int) -> Node2D:
	var t := Node2D.new()
	var spr := Sprite2D.new()
	var tex := TOY_TEXTURES[k]
	spr.texture = tex
	spr.centered = true
	var ts := tex.get_size()
	spr.scale = Vector2.ONE * (TOY_HEIGHT / maxf(ts.x, ts.y))
	t.add_child(spr)
	return t


func _build_pip(r: int) -> Node2D:
	var p := BUNNY_SCENE.instantiate() as Node2D
	_pip_sprite = _find_animated_sprite(p)
	assert(_pip_sprite != null, "Bunny-eats.tscn needs an AnimatedSprite2D")
	_pip_sprite.centered = true
	_pip_sprite.position = Vector2.ZERO
	# Round 0: the bunny faces its natural (unflipped) way.
	# Round 1: flipped, so it faces left toward the toy box beside it.
	_pip_sprite.flip_h = (r == 1)

	var frame_size := Vector2(100, 100)
	var tex := _pip_sprite.sprite_frames.get_frame_texture(ANIM_WAITING, 0)
	if tex:
		frame_size = tex.get_size()
	p.scale = Vector2.ONE * (BUNNY_HEIGHT / frame_size.y)

	# The eating reaction plays ONCE per carrot, then settles back to waiting.
	_pip_sprite.sprite_frames.set_animation_loop(ANIM_EATING, false)
	_pip_sprite.animation_finished.connect(_on_pip_anim_finished)
	_pip_sprite.play(ANIM_WAITING)
	return p


func _find_animated_sprite(node: Node) -> AnimatedSprite2D:
	if node is AnimatedSprite2D:
		return node as AnimatedSprite2D
	for child in node.get_children():
		var found := _find_animated_sprite(child)
		if found:
			return found
	return null


func _on_pip_anim_finished() -> void:
	if _pip_sprite.animation == ANIM_EATING:
		_pip_sprite.play(ANIM_WAITING)


# ----------------------------------------------------------------
#  Dragging: press, HOLD, move, release
# ----------------------------------------------------------------
func _process(_delta: float) -> void:
	if _finished:
		return
	var mouse := get_viewport().get_mouse_position()

	if _dragging >= 0:
		# The held item follows the mouse; the dotted guide updates.
		var node: Node2D = _items[_dragging]["node"]
		node.position = mouse + _drag_offset
		_update_guide(node.position)
		return

	# Pointing hand over any undelivered item.
	var over := _item_under(mouse) >= 0
	if over and not _hand_cursor_on:
		Input.set_default_cursor_shape(Input.CURSOR_POINTING_HAND)
	elif not over and _hand_cursor_on:
		Input.set_default_cursor_shape(Input.CURSOR_ARROW)
	_hand_cursor_on = over


func _item_under(pos: Vector2) -> int:
	for i in _items.size():
		var it: Dictionary = _items[i]
		if it["delivered"]:
			continue
		var node: Node2D = it["node"]
		if pos.distance_to(node.position) <= PICK_RADIUS[_round]:
			return i
	return -1


func _input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		_idle_timer.start()
		_hide_ghost()
		return
	if _finished or not (event is InputEventMouseButton):
		return
	var mb := event as InputEventMouseButton
	if mb.button_index != MOUSE_BUTTON_LEFT:
		return
	_idle_timer.start()
	_hide_ghost()

	if mb.pressed:
		var i := _item_under(mb.position)
		if i >= 0:
			_grab(i, mb.position)
	else:
		if _dragging >= 0:
			_release(mb.position)


func _grab(i: int, at: Vector2) -> void:
	_dragging = i
	var node: Node2D = _items[i]["node"]
	_drag_offset = node.position - at
	Input.set_default_cursor_shape(Input.CURSOR_DRAG)
	_play_tone(500.0, 650.0, 0.08, 0.2)   # little "got it"

	# Happy wobble while held.
	if _wobble_tween:
		_wobble_tween.kill()
	_wobble_tween = create_tween().set_loops()
	_wobble_tween.tween_property(node, "rotation_degrees", 8.0, 0.15)\
		.set_trans(Tween.TRANS_SINE)
	_wobble_tween.tween_property(node, "rotation_degrees", -8.0, 0.15)\
		.set_trans(Tween.TRANS_SINE)

	_update_guide(node.position)
	_guide.visible = true


func _update_guide(from: Vector2) -> void:
	# A dotted line from the held item to the drop target.
	var to := _target.position
	var pts := PackedVector2Array()
	var dir := to - from
	var dist := dir.length()
	var step := 26.0
	var n := int(dist / step)
	for k in n:
		var a := from + dir * (float(k) / float(n))
		var b := from + dir * (minf(float(k) + 0.45, float(n)) / float(n))
		pts.append(a)
		pts.append(b)
	_guide.points = pts


func _release(at: Vector2) -> void:
	var i := _dragging
	_dragging = -1
	Input.set_default_cursor_shape(Input.CURSOR_ARROW)
	_hand_cursor_on = false
	_guide.visible = false
	var node: Node2D = _items[i]["node"]
	if _wobble_tween:
		_wobble_tween.kill()
	node.rotation_degrees = 0.0

	if at.distance_to(_target.position) <= DROP_RADIUS[_round]:
		_deliver(i)
	else:
		# Slipped: it just stays where it fell. No reset.
		_play_tone(350.0, 250.0, 0.15, 0.15)   # soft plop
		var t := create_tween()
		t.tween_property(node, "position:y", node.position.y + 10.0, 0.12)\
			.set_trans(Tween.TRANS_BOUNCE).set_ease(Tween.EASE_OUT)
		_say(VOICE_SLIPED, "Oops, it slipped! Grab it again!")


func _deliver(i: int) -> void:
	_items[i]["delivered"] = true
	_delivered += 1
	var node: Node2D = _items[i]["node"]

	var t := create_tween()
	t.tween_property(node, "position", _target.position + Vector2(0, -10), 0.2)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	if _round == 0:
		# The bunny chomps the carrot: shrink away + munch sounds + the
		# bunny's own eating animation.
		_play_tone(300.0, 260.0, 0.08, 0.25)
		_play_tone_delayed(300.0, 260.0, 0.08, 0.25, 0.15)
		t.tween_callback(func () -> void: _pip_sprite.play(ANIM_EATING))
		t.tween_property(node, "scale", Vector2.ZERO, 0.3)\
			.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
		t.tween_callback(node.queue_free)
		_say(VOICE_YUMYUM, "Yum yum! Thank you!")
	else:
		# Toy settles into the box, then disappears inside it.
		_play_tone(600.0, 900.0, 0.12, 0.25)
		t.tween_property(node, "position",
			_target.position + Vector2(-30.0 + _delivered * 22.0, 0.0), 0.25)
		t.parallel().tween_property(node, "scale", Vector2.ZERO, 0.25)\
			.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
		t.tween_callback(node.queue_free)
		_say(VOICE_IN_IT_GOES, "In it goes! Tidy!")

	# Little hop of joy from Pip.
	var hop := create_tween()
	hop.tween_property(_pip, "position:y", _pip.position.y - 16.0, 0.15)\
		.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	hop.tween_property(_pip, "position:y", _pip.position.y, 0.2)\
		.set_trans(Tween.TRANS_BOUNCE).set_ease(Tween.EASE_OUT)

	if _delivered >= ROUND_ITEM_COUNTS[_round]:
		if _round == 0:
			await get_tree().create_timer(1.4).timeout
			_start_round(1)
		else:
			_finish_level()


# ----------------------------------------------------------------
#  Finish: Pip eats, happy dance, FINAL star
#  (handled by the global StarChart autoload, same as every other level)
# ----------------------------------------------------------------
func _finish_level() -> void:
	_finished = true
	_idle_timer.stop()
	_hide_ghost()
	Input.set_default_cursor_shape(Input.CURSOR_ARROW)

	_say(VOICE_ALL_TIDY, "All tidy! Pip is full and happy! Mmmm!")
	# One more happy bite as the finale celebration.
	_pip_sprite.play(ANIM_EATING)
	await get_tree().create_timer(1.2).timeout
	_award_star()


func _award_star() -> void:
	StarChart.show_chart(StarChart.UNIT_1_LEVELS)
	await StarChart.add_star(LEVEL_NUMBER)
	level_completed.emit(LEVEL_NUMBER)
	get_tree().change_scene_to_file("res://Scenes/unit1-results.tscn")


# ----------------------------------------------------------------
#  Idle hint: ghost cursor demonstrates press-hold-drag-release
# ----------------------------------------------------------------
func _build_ghost_cursor() -> void:
	_ghost = Node2D.new()
	var arrow := Polygon2D.new()
	arrow.polygon = PackedVector2Array([
		Vector2(0, 0), Vector2(0, 26), Vector2(7, 20),
		Vector2(12, 30), Vector2(16, 28), Vector2(11, 18), Vector2(19, 17)
	])
	arrow.color = Color(0.4, 0.4, 0.9, 0.5)
	_ghost.add_child(arrow)
	_ghost.visible = false
	_ghost.z_index = 100
	add_child(_ghost)


func _on_idle_hint() -> void:
	if _finished or _dragging >= 0:
		return
	var first := -1
	for i in _items.size():
		var it: Dictionary = _items[i]
		if not it["delivered"]:
			first = i
			break
	if first < 0:
		return
	_say(_current_voice, _current_instruction)
	var node: Node2D = _items[first]["node"]
	_ghost.visible = true
	_ghost.position = get_viewport().get_mouse_position()
	var t := create_tween()
	# Glide to the item...
	t.tween_property(_ghost, "position", node.position, 1.0)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	# ...press (stay small = held down)...
	t.tween_property(_ghost, "scale", Vector2.ONE * 0.75, 0.15)
	# ...drag to the target while held...
	t.tween_property(_ghost, "position", _target.position, 1.2)\
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	# ...release.
	t.tween_property(_ghost, "scale", Vector2.ONE, 0.15)
	t.tween_interval(0.3)
	t.tween_callback(_hide_ghost)
	_idle_timer.start()


func _hide_ghost() -> void:
	if _ghost:
		_ghost.visible = false
		_ghost.scale = Vector2.ONE


# ----------------------------------------------------------------
#  UI: one short text line + speaker button
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
	# Soft dark outline keeps rainbow text readable on pastel backgrounds.
	_instruction_label.add_theme_color_override("font_outline_color", Color("5a4a6b"))
	_instruction_label.add_theme_constant_override("outline_size", 10)
	_instruction_label.add_theme_constant_override("line_separation", 28)
	# Just below the star badge row, with breathing room.
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
	_speaker_btn.pressed.connect(func () -> void: _say(_current_voice, _current_instruction))
	layer.add_child(_speaker_btn)


# ----------------------------------------------------------------
#  Narration: recorded voice clips (audio-first), text line synced
# ----------------------------------------------------------------
func _say(clip: AudioStream, text: String) -> void:
	_instruction_label.text = (
		"[center][rainbow freq=0.25 sat=0.55 val=0.95]"
		+ text
		+ "[/rainbow][/center]"
	)
	_voice.stop()               # never overlap two voice lines
	if clip:
		_voice.stream = clip
		_voice.play()


## Plays two clips back-to-back (used where one line covers two beats
## that only have separate recordings, e.g. "Pip is hungry!" + "Press
## the button..."). The text line is set once, up front.
func _say_sequence(first: AudioStream, second: AudioStream, text: String) -> void:
	_instruction_label.text = (
		"[center][rainbow freq=0.25 sat=0.55 val=0.95]"
		+ text
		+ "[/rainbow][/center]"
	)
	_voice.stop()
	_voice.stream = first
	_voice.play()
	await _voice.finished
	_voice.stream = second
	_voice.play()


# ----------------------------------------------------------------
#  Sounds (generated, zero assets)
# ----------------------------------------------------------------
func _play_tone(freq_start: float, freq_end: float, dur: float, vol: float) -> void:
	var player := AudioStreamPlayer.new()
	add_child(player)
	player.stream = _tone_wave(freq_start, freq_end, dur, vol)
	player.finished.connect(player.queue_free)
	player.play()


# Builds the tone as a real WAV buffer up front instead of feeding an
# AudioStreamGenerator live from the main thread — the live-push API
# contends with the audio mixer thread, and several tones/voice lines
# starting at once (e.g. right after finishing a level) was able to
# hang the whole process.
func _tone_wave(freq_start: float, freq_end: float, dur: float, vol: float) -> AudioStreamWAV:
	var mix_rate := 22050
	var frames := int(mix_rate * dur)
	var data := PackedByteArray()
	data.resize(frames * 2)   # 16-bit mono
	var byte_idx := 0
	for i in frames:
		var tt := float(i) / mix_rate
		var k := tt / dur
		var freq := lerpf(freq_start, freq_end, k)
		var env := 1.0 - k
		var v := sin(TAU * freq * tt) * vol * env
		data.encode_s16(byte_idx, int(clampf(v, -1.0, 1.0) * 32767.0))
		byte_idx += 2
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = mix_rate
	wav.stereo = false
	wav.data = data
	return wav


func _play_tone_delayed(freq_start: float, freq_end: float, dur: float, vol: float, delay: float) -> void:
	get_tree().create_timer(delay).timeout.connect(
		func () -> void: _play_tone(freq_start, freq_end, dur, vol)
	)
