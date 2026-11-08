#define _GNU_SOURCE
#include <poll.h>
#include <sched.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/fcntl.h>
#include <sys/socket.h>
#include <sys/syscall.h> /* Definition of SYS_* constants */
#include <sys/un.h>
#include <unistd.h>

static int
pidfd_open(pid_t pid, unsigned int flags) {
	return syscall(SYS_pidfd_open, pid, flags);
}

void fakeroot(int uid, int gid) {
	int fd = open("/proc/self/uid_map", O_WRONLY);
	char buff[256];
	int bytes = sprintf(buff, "0 %d 1", uid);
	write(fd, buff, bytes);	 // do not write the null terminator
	close(fd);
	fd = open("/proc/self/setgroups", O_WRONLY);
	write(fd, "deny", 4);
	close(fd);
	fd = open("/proc/self/gid_map", O_WRONLY);
	bytes = sprintf(buff, "0 %d 1", gid);
	write(fd, buff, bytes);	 // do not write the null terminator
	close(fd);
}

// boots the broker in a separate usernamespace
// this is allowed to allow it to transfer its socket fds to
// the processes that actually do the dirty work,
// this also allows it to restart and rooms to persist unaffected
// however because of restrictions with unshare and setns (unavailable in multithreaded processes)
// we can't call them directly from node as v8 is multithreaded
// so all that init logic is implemented in C here
int main(int ac, char **av, char **ev) {
	const char *bindpath = "reaggie";
	struct sockaddr_un addr;
	int sfd;

	/*
        Make a dummy server, if we get a connection then 
        we know which namespace to join
    */
	if ((sfd = socket(PF_UNIX, SOCK_STREAM, 0)) < 0) {
		perror("socket");
		return 1;
	}

	memset(&addr, 0, sizeof(addr));
	addr.sun_family = AF_UNIX;
	strcpy(addr.sun_path + 1, bindpath); // leave a 0 byte for abstract sockets
	//unlink(bindpath); // abstract sockets are used now, so no need to unlink
	
	if (bind(sfd, (struct sockaddr *)&addr, sizeof(sa_family_t) + 1 + strlen(bindpath)) < 0) {
		perror("bind");
		// will probably fail with address in use
		return 1;
	}
	listen(sfd, 8);

	struct pollfd pfd = {sfd, POLLIN};
	puts("Waiting for connection...");
	int k = poll(&pfd, 1, 3000);  // give some time for a room process to reconnect
	int uid = geteuid();
	int gid = getegid();

	if (k == 0) {  // nothing was ready, so create a new namespace
				   // new user mapping
		puts("No new connection, creating new namespace...");
		close(sfd);
		unshare(CLONE_NEWUSER);
		fakeroot(uid, gid);
		// map current user to root
		// we should appear as root, now
	} else {
		// found a room, join their namespace
		puts("Rejoining existing namespace...");
		printf("k: %d\n", k);
		struct sockaddr_un peer;
		socklen_t pl = sizeof(peer);
		if ((pfd.revents & POLLIN) != POLLIN) {
			puts("Something failed during the poll?");
			exit(3);
		}
		int cfd = accept(sfd, &peer, &pl);
		printf("Got peer: %d\n", cfd);
		const char *cmd = "{\"type\":\"getpid\"}";
		int len = strlen(cmd);
		void *b = malloc(sizeof(len) + len);
		int rlen = htobe32(len);  // frame-stream uses big endian
		memcpy(b, &rlen, sizeof(len));
		memcpy(b + sizeof(len), cmd, len);
		write(cfd, b, sizeof(len) + len);
		puts("submitted command");
		int reply[2];
		printf("read of %zu bytes\n", sizeof(reply));
		int r = read(cfd, reply, sizeof(reply));
		printf("read: %d\n", r);
		int cpid = reply[1];
		printf("peerpid: %d\n", cpid);
		close(cfd);
		close(sfd);
		// unlink(bindpath);
		int pfd = pidfd_open(cpid, 0);
		printf("pfd: %d\n", pfd);
		r = setns(pfd, CLONE_NEWUSER);
		if (r != 0) {
			perror("setns");
			exit(43);
		}
		fakeroot(uid, gid);
		puts("faked root");
		printf("Joined namespace %d.", r);
	}

	execve(av[1], av + 1, ev);
}